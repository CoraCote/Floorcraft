-- 0017_platform_admin.sql
--
-- Platform-admin role + Phase 1 admin RPCs (overview dashboard +
-- admin management). Distinct from team-admin: a team admin runs
-- ONE team's members + offices; a platform admin sees the whole
-- service (every team, every office, billing, support tooling).
--
-- The flag lives on `profiles.is_platform_admin` (boolean). Reading
-- the flag for the current session is gated through an RPC so we
-- don't need a special RLS policy that would let any authenticated
-- caller probe other users' admin status.
--
-- BOOTSTRAPPING: there's no admin to grant the first admin. After
-- this migration applies, set yourself as platform admin via:
--
--   update profiles set is_platform_admin = true
--   where email = 'you@example.com';

alter table profiles
  add column if not exists is_platform_admin boolean not null default false;

create index if not exists profiles_platform_admins_idx
  on profiles(id) where is_platform_admin = true;

-- -----------------------------------------------------------------
-- Helper: am I a platform admin? Used both by client gating and as
-- the auth check inside the other RPCs below. SECURITY DEFINER so
-- callers don't need direct SELECT on profiles to read their own
-- flag.
-- -----------------------------------------------------------------
create or replace function public.is_current_user_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_platform_admin from profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_current_user_platform_admin() from public;
grant execute on function public.is_current_user_platform_admin()
  to authenticated;

-- -----------------------------------------------------------------
-- Platform overview — read-only counts for the admin dashboard.
-- Returns a single jsonb so the wire stays compact and the client
-- can extend the shape without renegotiating column lists.
-- -----------------------------------------------------------------
create or replace function public.get_platform_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count int;
  team_count int;
  office_count int;
  signups_7d int;
  signups_30d int;
  admin_count int;
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  select count(*) into user_count from profiles;
  select count(*) into team_count from teams;
  select count(*) into office_count from offices;
  select count(*) into signups_7d
    from profiles
    where created_at >= clock_timestamp() - interval '7 days';
  select count(*) into signups_30d
    from profiles
    where created_at >= clock_timestamp() - interval '30 days';
  select count(*) into admin_count
    from profiles
    where is_platform_admin = true;

  return jsonb_build_object(
    'users', user_count,
    'teams', team_count,
    'offices', office_count,
    'signups_7d', signups_7d,
    'signups_30d', signups_30d,
    'admins', admin_count
  );
end;
$$;

revoke all on function public.get_platform_overview() from public;
grant execute on function public.get_platform_overview() to authenticated;

-- -----------------------------------------------------------------
-- Admin management RPCs — list / grant / revoke.
-- -----------------------------------------------------------------
create or replace function public.list_platform_admins()
returns table (
  id uuid,
  email text,
  name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  return query
    select p.id, p.email, p.name, p.created_at
    from profiles p
    where p.is_platform_admin = true
    order by p.email;
end;
$$;

revoke all on function public.list_platform_admins() from public;
grant execute on function public.list_platform_admins() to authenticated;

create or replace function public.grant_platform_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'user_not_found';
  end if;
  update profiles set is_platform_admin = true where id = p_user_id;
end;
$$;

revoke all on function public.grant_platform_admin(uuid) from public;
grant execute on function public.grant_platform_admin(uuid) to authenticated;

create or replace function public.revoke_platform_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admin_count int;
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  -- Lockout protection: don't let the last platform admin revoke
  -- themselves (or get revoked by another admin who's racing the
  -- decision). Without this guard the platform could end up in a
  -- state where no one can grant a new admin.
  select count(*) into remaining_admin_count
    from profiles
    where is_platform_admin = true and id <> p_user_id;
  if remaining_admin_count = 0 then
    raise exception 'last_admin_protected';
  end if;
  update profiles set is_platform_admin = false where id = p_user_id;
end;
$$;

revoke all on function public.revoke_platform_admin(uuid) from public;
grant execute on function public.revoke_platform_admin(uuid) to authenticated;

-- -----------------------------------------------------------------
-- Profile lookup by email — admins need to find a user to promote
-- without knowing their UUID. Returns at most one row.
-- -----------------------------------------------------------------
create or replace function public.find_user_by_email(p_email text)
returns table (
  id uuid,
  email text,
  name text,
  is_platform_admin boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  return query
    select p.id, p.email, p.name, p.is_platform_admin
    from profiles p
    where lower(p.email) = lower(btrim(p_email))
    limit 1;
end;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;
