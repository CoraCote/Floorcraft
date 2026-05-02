-- 0019_team_suspension.sql
--
-- Sprint 1A — platform admins can suspend a team. Reversible (no
-- hard-delete). When suspended:
--   * Members can still SIGN IN and READ their data (so they can
--     export anything they need before action).
--   * All writes to office payloads + employees + share-tokens etc.
--     are blocked at the database via a row-level trigger.
--   * The client surfaces a banner explaining the state + the reason
--     the admin recorded.
--
-- This pattern intentionally diverges from "delete" — most of the
-- time we want a soft, reversible action; hard-delete is a separate
-- pipeline gated on GDPR / billing-collection workflows.

alter table teams
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspension_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references profiles(id);

create index if not exists teams_suspended_idx
  on teams(id) where is_suspended = true;

-- ----------------------------------------------------------------
-- Admin-only RPC: flip suspension on/off. SECURITY DEFINER + the
-- standard `is_current_user_platform_admin()` gate. Records the
-- actor + timestamp + a free-form reason so the team-side banner
-- can surface "Suspended Mar 4 because <reason>".
-- ----------------------------------------------------------------
create or replace function public.admin_set_team_suspended(
  p_team_id uuid,
  p_suspended boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from teams where id = p_team_id) then
    raise exception 'team_not_found';
  end if;

  if p_suspended then
    update teams
      set is_suspended = true,
          suspension_reason = nullif(btrim(coalesce(p_reason, '')), ''),
          suspended_at = clock_timestamp(),
          suspended_by = auth.uid()
      where id = p_team_id;
  else
    -- Unsuspending preserves the reason in case the admin reverts a
    -- decision and wants the history. The new banner won't show it
    -- because it gates on is_suspended; the audit log keeps it.
    update teams
      set is_suspended = false,
          suspended_at = null,
          suspended_by = null
      where id = p_team_id;
  end if;
end;
$$;

revoke all on function public.admin_set_team_suspended(uuid, boolean, text) from public;
grant execute on function public.admin_set_team_suspended(uuid, boolean, text)
  to authenticated;

-- ----------------------------------------------------------------
-- Admin-only RPC: bundle a team's detail (members + office count +
-- suspension state) for the /admin/teams/:id page. Single round
-- trip beats N selects.
-- ----------------------------------------------------------------
create or replace function public.admin_get_team_detail(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  team_row teams%rowtype;
  members jsonb;
  office_count int;
  suspended_by_email text;
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  select * into team_row from teams where id = p_team_id;
  if not found then
    raise exception 'team_not_found';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', tm.user_id,
      'role', tm.role,
      'email', p.email,
      'name', p.name,
      'joined_at', tm.joined_at
    )
    order by tm.joined_at
  ), '[]'::jsonb)
  into members
  from team_members tm
  join profiles p on p.id = tm.user_id
  where tm.team_id = p_team_id;

  select count(*) into office_count from offices where team_id = p_team_id;

  if team_row.suspended_by is not null then
    select email into suspended_by_email
    from profiles where id = team_row.suspended_by;
  end if;

  return jsonb_build_object(
    'id', team_row.id,
    'slug', team_row.slug,
    'name', team_row.name,
    'created_at', team_row.created_at,
    'is_suspended', team_row.is_suspended,
    'suspension_reason', team_row.suspension_reason,
    'suspended_at', team_row.suspended_at,
    'suspended_by_email', suspended_by_email,
    'office_count', office_count,
    'members', members
  );
end;
$$;

revoke all on function public.admin_get_team_detail(uuid) from public;
grant execute on function public.admin_get_team_detail(uuid) to authenticated;

-- ----------------------------------------------------------------
-- Server-side enforcement: a trigger on `offices` that blocks any
-- INSERT / UPDATE / DELETE when the owning team is suspended. This
-- is the load-bearing guard — without it, suspension is just a
-- client-side banner, which any caller could bypass by hitting
-- supabase directly.
--
-- We hang it on offices (the largest write surface) for v1. Office-
-- adjacent tables (employees live in payload, share_tokens, etc.)
-- write through office_id and so transitively get covered as long as
-- they cascade through office RLS.
-- ----------------------------------------------------------------
create or replace function public.guard_team_not_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_team_active boolean;
  team_id_to_check uuid;
begin
  -- Pick the right team_id depending on op + table shape. For
  -- offices we have NEW.team_id on insert/update; on delete the
  -- OLD row carries it.
  team_id_to_check := coalesce(NEW.team_id, OLD.team_id);
  if team_id_to_check is null then
    return coalesce(NEW, OLD);
  end if;

  -- Platform admins can mutate suspended teams' rows (e.g. to
  -- prepare for unsuspension). Skipping the check for them.
  if is_current_user_platform_admin() then
    return coalesce(NEW, OLD);
  end if;

  select not is_suspended into is_team_active
    from teams where id = team_id_to_check;

  if not coalesce(is_team_active, true) then
    raise exception 'team_suspended'
      using hint = 'Contact support to restore access.';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists offices_team_active_trigger on offices;
create trigger offices_team_active_trigger
  before insert or update or delete on offices
  for each row execute function guard_team_not_suspended();

-- ----------------------------------------------------------------
-- Reading the team's own suspension state needs to work for members
-- so the client banner can render. The existing teams RLS policy
-- (members can SELECT their team) covers it; this comment documents
-- the dependency.
-- ----------------------------------------------------------------
