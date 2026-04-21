-- supabase/migrations/0006_p0_security_fixes.sql
--
-- Addresses the P0 findings from the 2026-04-21 senior-dev review.
--
--   #1  Email case-sensitivity: unique index + RLS compared raw strings
--       but accept_invite lowercased, so admins could create duplicate
--       invites for the same mailbox and invitees could be locked out
--       of their own invite on case-mismatch signup.
--
--   #2  accept_invite compared profiles.email to the caller, but
--       profiles.email was set once at signup from auth.users.email and
--       never resynced. A user who changed their verified email via
--       auth.updateUser({email}) would either be unable to accept a new
--       invite or — with a stale profile row — could potentially accept
--       an invite meant for a different address.
--
--   #3  The invites SELECT policy let any authenticated user read every
--       row whose `email` matched their own profile email, across every
--       team. The token column leaked through that channel.
--
--   #4  accept_invite hardcoded role='member', so there was no way to
--       invite someone as an admin. Losing the founding admin would
--       require direct SQL.
--
--   #16 handle_new_user had no `on conflict` clause; stale profile rows
--       (replay, test seed, manual insert) caused signup to fail with a
--       generic DB error.

-- -----------------------------------------------------------------
-- #1 + #16 — Lowercase email everywhere, enforce it, tolerate replay.
-- -----------------------------------------------------------------

-- Backfill any existing rows so the new check constraint can land.
update profiles set email = lower(email) where email <> lower(email);
update invites  set email = lower(email) where email <> lower(email);

alter table profiles add constraint profiles_email_lowercase
  check (email = lower(email));

alter table invites add constraint invites_email_lowercase
  check (email = lower(email));

-- Defense in depth: normalize at the trigger level so any future
-- raw SQL path still produces lowercase rows.
create or replace function normalize_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(new.email);
  return new;
end;
$$;

create trigger invites_normalize_email
  before insert or update of email on invites
  for each row execute function normalize_email();

create trigger profiles_normalize_email
  before insert or update of email on profiles
  for each row execute function normalize_email();

-- Rewrite handle_new_user: lowercase the email, tolerate a pre-existing
-- profile row. `on conflict (id) do nothing` means signup succeeds even
-- if a stale row exists — no data loss, no spurious "Database error
-- saving new user" in the client.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Keep profiles.email in sync when the user changes their verified
-- email via auth.updateUser. Fires on every auth.users update; the
-- `when` clause makes it cheap in the common password-change case.
create or replace function sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set email = lower(new.email)
    where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function sync_profile_email();

-- -----------------------------------------------------------------
-- #3 — Tighten invites SELECT: admins only. Invitees read via the
--      accept_invite RPC (which is SECURITY DEFINER and enforces the
--      email match). The old policy leaked token metadata to anyone
--      whose profile email matched a row in invites, across all teams.
-- -----------------------------------------------------------------

drop policy if exists invites_admin_or_recipient_read on invites;

create policy invites_admin_read on invites
  for select using (is_team_admin(team_id));

-- -----------------------------------------------------------------
-- #4 — Add a role column to invites so admins can invite admins.
--      Default 'member' keeps existing rows valid and matches prior
--      behavior. Acceptance uses the column instead of a hardcoded
--      literal.
-- -----------------------------------------------------------------

alter table invites
  add column role text not null default 'member'
  check (role in ('admin','member'));

-- -----------------------------------------------------------------
-- #2 + #4 — Rewrite accept_invite to resolve the caller's identity
--           from auth.users (the authoritative source) and to honor
--           the invite's role column.
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

  if invite_record.accepted_at is not null then
    raise exception 'invite_already_used';
  end if;

  if invite_record.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  if lower(invite_record.email) <> lower(caller_email) then
    raise exception 'invite_email_mismatch';
  end if;

  insert into team_members (team_id, user_id, role)
  values (invite_record.team_id, auth.uid(), invite_record.role)
  on conflict do nothing;

  update invites set accepted_at = now() where id = invite_record.id;

  return invite_record.team_id;
end;
$$;

grant execute on function accept_invite(uuid) to authenticated;
