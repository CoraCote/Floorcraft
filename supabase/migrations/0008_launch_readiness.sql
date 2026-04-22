-- supabase/migrations/0007_launch_readiness.sql
--
-- Pre-launch hardening batch covering the engineering review's P0/P1
-- items that need DB support, plus the GDPR surface the ops review
-- flagged as blocking paid open-signup.
--
--   [P0-edge-rl]  Rate limit send-invite-email per caller. Table +
--                 SECURITY DEFINER function that counts recent calls
--                 inside a sliding window and inserts a fresh row.
--
--   [P0-overwrite] offices_history append-only table. saveOfficeForce
--                 records the prior payload before overwriting so
--                 accidentally-accepted conflict resolutions are
--                 recoverable.
--
--   [P0-gdpr]    export_user_data(): returns every row the caller owns
--                or is a member-of across the schema as one JSON blob.
--                request_account_deletion(): soft-flags the caller and
--                schedules a 30-day hard delete.
--
--   [P1-idemp]   accept_invite is now idempotent. If the caller is
--                already in team_members for the invite's team, return
--                the team_id instead of raising invite_already_used —
--                makes the client safe to retry on dropped responses.
--
--   [P1-index]   Composite index on team_members(team_id, user_id) so
--                the is_team_member / is_team_admin helpers used in
--                every RLS predicate don't seq-scan at 1000+ teams.
--
--   [P1-directory] team_member_directory_visibility column on teams.
--                Admin-controlled toggle that gates the cross-member
--                email read so a single-team member can't enumerate
--                every colleague's email at will.

-- -----------------------------------------------------------------
-- [P1-index] Composite index matching the RLS helper predicate.
-- -----------------------------------------------------------------
create index if not exists team_members_team_user_idx
  on team_members(team_id, user_id);

-- -----------------------------------------------------------------
-- [P0-edge-rl] Rate-limit storage + atomic count-and-insert RPC.
-- Storing the event rows in Postgres (rather than an in-memory bucket
-- inside the edge function) is required because edge function
-- instances have no shared memory — a cold start would reset counts
-- for a specific caller and an abusive admin could simply wait out a
-- few seconds to bypass the limit.
-- -----------------------------------------------------------------
create table if not exists edge_rate_limit_events (
  id bigserial primary key,
  bucket text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists edge_rate_limit_events_lookup_idx
  on edge_rate_limit_events(bucket, actor_id, created_at desc);

-- Retain at most 24h of rate-limit events so the table doesn't grow
-- unbounded. Scheduled cleanup happens in the next migration; here we
-- just cap the sliding-window lookup.
create or replace function record_send_invite_email_call(
  p_user_id uuid,
  p_window_seconds int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  call_count int;
begin
  insert into edge_rate_limit_events (bucket, actor_id)
    values ('send-invite-email', p_user_id);

  select count(*) into call_count
    from edge_rate_limit_events
    where bucket = 'send-invite-email'
      and actor_id = p_user_id
      and created_at >= window_start;

  return call_count;
end;
$$;

revoke all on function record_send_invite_email_call(uuid, int) from public;
grant execute on function record_send_invite_email_call(uuid, int)
  to service_role;

-- -----------------------------------------------------------------
-- [P0-overwrite] offices_history — append-only audit of prior
-- payloads. saveOfficeForce writes a row *before* the overwrite so if
-- the other writer's work is gone, an admin can recover it.
-- -----------------------------------------------------------------
create table if not exists offices_history (
  id bigserial primary key,
  office_id uuid not null references offices(id) on delete cascade,
  prior_payload jsonb not null,
  prior_updated_at timestamptz not null,
  overwritten_by uuid references auth.users(id) on delete set null,
  overwritten_at timestamptz not null default now()
);

create index if not exists offices_history_office_idx
  on offices_history(office_id, overwritten_at desc);

alter table offices_history enable row level security;

-- Only team admins of the office's team can read history.
create policy offices_history_admin_read on offices_history
  for select using (
    exists (
      select 1 from offices o
      where o.id = offices_history.office_id
        and is_team_admin(o.team_id)
    )
  );

-- Inserts happen exclusively through the save_office_force RPC below
-- (SECURITY DEFINER). No direct-insert policy.

create or replace function save_office_force(
  p_office_id uuid,
  p_payload jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  prior offices%rowtype;
  new_updated timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Snapshot whatever is on the server right now. This is the
  -- authoritative base: the client's `loadedVersion` might be stale.
  select * into prior from offices where id = p_office_id for update;
  if prior is null then
    raise exception 'office_not_found';
  end if;

  -- Authorization: RLS would normally block this call, but
  -- SECURITY DEFINER bypasses RLS. Re-implement the editor check so
  -- we don't accidentally open the rpc to any authenticated caller.
  if not (
    is_team_admin(prior.team_id) or
    office_perm_role(p_office_id) in ('owner', 'editor')
  ) then
    raise exception 'forbidden';
  end if;

  insert into offices_history (
    office_id, prior_payload, prior_updated_at, overwritten_by
  ) values (
    p_office_id, prior.payload, prior.updated_at, auth.uid()
  );

  update offices
    set payload = p_payload,
        updated_at = now()
    where id = p_office_id
  returning updated_at into new_updated;

  return new_updated;
end;
$$;

revoke all on function save_office_force(uuid, jsonb) from public;
grant execute on function save_office_force(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------
-- [P1-idemp] accept_invite becomes idempotent. A client that retries
-- on network failure must get the team_id back, not a scary error.
-- -----------------------------------------------------------------
create or replace function accept_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record invites%rowtype;
  caller_email text;
  already_member boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null then
    raise exception 'no_auth_user';
  end if;

  select * into invite_record from invites where token = invite_token;
  if invite_record is null then
    raise exception 'invite_not_found';
  end if;

  if lower(invite_record.email) <> lower(caller_email) then
    raise exception 'invite_email_mismatch';
  end if;

  -- Idempotence: if the caller is already a member of this team, the
  -- previous accept_invite call succeeded and this is a retry. Return
  -- the team_id so the client flow completes cleanly.
  select exists (
    select 1 from team_members
    where team_id = invite_record.team_id
      and user_id = auth.uid()
  ) into already_member;

  if already_member then
    -- Make sure the invite row is marked accepted (the first call
    -- might have failed *after* inserting the member row).
    update invites
      set accepted_at = coalesce(accepted_at, now())
      where id = invite_record.id;
    return invite_record.team_id;
  end if;

  if invite_record.accepted_at is not null then
    raise exception 'invite_already_used';
  end if;

  if invite_record.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  insert into team_members (team_id, user_id, role)
  values (invite_record.team_id, auth.uid(), invite_record.role)
  on conflict do nothing;

  update invites set accepted_at = now() where id = invite_record.id;

  return invite_record.team_id;
end;
$$;

grant execute on function accept_invite(uuid) to authenticated;

-- -----------------------------------------------------------------
-- [P1-directory] Member-directory visibility toggle.
-- -----------------------------------------------------------------
alter table teams
  add column if not exists member_directory_visibility text not null default 'members'
  check (member_directory_visibility in ('members', 'admins'));

-- Rewrite the cross-member profile read so non-admins only see each
-- other's email when the team explicitly allows it. The pre-existing
-- `profiles_teammate_read` policy was unconditional.
drop policy if exists profiles_teammate_read on profiles;

create policy profiles_teammate_read on profiles
  for select using (
    -- Always: you can read your own profile.
    id = auth.uid()
    or
    -- Otherwise: a teammate row, gated on the team's visibility
    -- setting. Admins always see all members.
    exists (
      select 1
      from team_members me
      join team_members them on them.team_id = me.team_id
      join teams t on t.id = me.team_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
        and (
          t.member_directory_visibility = 'members'
          or me.role = 'admin'
        )
    )
  );

-- -----------------------------------------------------------------
-- [P0-gdpr] Account data export + deletion request.
-- -----------------------------------------------------------------

-- Soft-delete request queue. Hard-delete happens out-of-band (a
-- scheduled job or manual ops step in the first weeks post-launch).
-- Keeping a queue row rather than deleting immediately:
--   - lets the user cancel within 30 days
--   - gives support time to handle billing/contract unwinds
--   - protects against a compromised account being insta-nuked
create table if not exists account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz
);

alter table account_deletion_requests enable row level security;

create policy adr_self_read on account_deletion_requests
  for select using (user_id = auth.uid());

-- Direct writes are gated through the RPCs below.

create or replace function request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  scheduled timestamptz := now() + interval '30 days';
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  insert into account_deletion_requests (user_id, requested_at, scheduled_for)
  values (caller, now(), scheduled)
  on conflict (user_id) do update
    set requested_at = now(),
        scheduled_for = excluded.scheduled_for,
        cancelled_at = null,
        completed_at = null;

  return scheduled;
end;
$$;

grant execute on function request_account_deletion() to authenticated;

create or replace function cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update account_deletion_requests
    set cancelled_at = now()
    where user_id = auth.uid()
      and completed_at is null
      and cancelled_at is null;
end;
$$;

grant execute on function cancel_account_deletion() to authenticated;

-- Export returns everything the caller can reasonably claim as "their
-- data": profile, team memberships, invites they sent or were sent,
-- and every office row they own or can edit. Large-ish blob but fine
-- for a one-off download.
create or replace function export_user_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  result jsonb;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  select jsonb_build_object(
    'profile', (
      select to_jsonb(p) from profiles p where p.id = caller
    ),
    'teams', coalesce((
      select jsonb_agg(to_jsonb(t) || jsonb_build_object('role', tm.role))
      from team_members tm
      join teams t on t.id = tm.team_id
      where tm.user_id = caller
    ), '[]'::jsonb),
    'invites_sent', coalesce((
      select jsonb_agg(to_jsonb(i))
      from invites i
      where i.invited_by = caller
    ), '[]'::jsonb),
    'invites_received', coalesce((
      select jsonb_agg(to_jsonb(i))
      from invites i
      where i.email = (select email from auth.users where id = caller)
    ), '[]'::jsonb),
    'offices', coalesce((
      select jsonb_agg(to_jsonb(o))
      from offices o
      where o.created_by = caller
         or o.team_id in (select team_id from team_members where user_id = caller)
    ), '[]'::jsonb),
    'exported_at', now()
  ) into result;

  return result;
end;
$$;

grant execute on function export_user_data() to authenticated;
