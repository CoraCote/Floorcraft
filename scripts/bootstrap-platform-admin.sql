-- bootstrap-platform-admin.sql
--
-- One-shot script for promoting the very first platform admin on a
-- fresh Supabase project. Idempotent: safe to re-run.
--
-- Bundles everything that needs to happen so the operator only
-- pastes once:
--   1. Schema (column + index from migration 0017)
--   2. Auth-check + admin-management RPCs (also 0017)
--   3. Read RPCs for the admin teams/users pages (0018)
--   4. Grant the column to the named email
--
-- HOW TO USE
-- ----------
--   1. Sign up the email below through your app's /signup flow first.
--   2. Open Supabase dashboard → SQL Editor → New query.
--   3. Edit the email below if needed (it's pre-filled).
--   4. Paste this whole file → Run.
--   5. Sign in to the app → /admin.
--
-- AFTER THIS RUNS ONCE, USE /admin/admins INSTEAD OF SQL.

------------------------------------------------------------
-- 1. Schema (idempotent column + supporting index)
------------------------------------------------------------
alter table profiles
  add column if not exists is_platform_admin boolean not null default false;

create index if not exists profiles_platform_admins_idx
  on profiles(id) where is_platform_admin = true;

------------------------------------------------------------
-- 2. Phase 1 RPCs (from migration 0017)
------------------------------------------------------------
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

------------------------------------------------------------
-- 3. Phase 2 read RPCs (from migration 0018)
------------------------------------------------------------
create or replace function public.admin_list_teams()
returns table (
  id uuid,
  slug text,
  name text,
  created_at timestamptz,
  member_count bigint,
  office_count bigint
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
    select
      t.id,
      t.slug,
      t.name,
      t.created_at,
      coalesce(mc.c, 0) as member_count,
      coalesce(oc.c, 0) as office_count
    from teams t
    left join (
      select team_id, count(*)::bigint as c
      from team_members
      group by team_id
    ) mc on mc.team_id = t.id
    left join (
      select team_id, count(*)::bigint as c
      from offices
      group by team_id
    ) oc on oc.team_id = t.id
    order by t.created_at desc;
end;
$$;

revoke all on function public.admin_list_teams() from public;
grant execute on function public.admin_list_teams() to authenticated;

create or replace function public.admin_list_users(
  p_limit int default 200
)
returns table (
  id uuid,
  email text,
  name text,
  created_at timestamptz,
  is_platform_admin boolean,
  team_count bigint
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
    select
      p.id,
      p.email,
      p.name,
      p.created_at,
      p.is_platform_admin,
      coalesce(tc.c, 0) as team_count
    from profiles p
    left join (
      select user_id, count(*)::bigint as c
      from team_members
      group by user_id
    ) tc on tc.user_id = p.id
    order by p.created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

revoke all on function public.admin_list_users(int) from public;
grant execute on function public.admin_list_users(int) to authenticated;

------------------------------------------------------------
-- 4. Promote the bootstrap user
------------------------------------------------------------
do $$
declare
  -- ⬇⬇⬇  CHANGE THIS EMAIL  ⬇⬇⬇
  bootstrap_email text := 'robertmcasto@gmail.com';
  -- ⬆⬆⬆  CHANGE THIS EMAIL  ⬆⬆⬆
  promoted_count int;
begin
  update profiles
    set is_platform_admin = true
    where lower(email) = lower(bootstrap_email);
  get diagnostics promoted_count = row_count;

  if promoted_count = 0 then
    raise notice 'No profile found for %. Sign up that email first, then re-run.', bootstrap_email;
  else
    raise notice 'Promoted % to platform admin.', bootstrap_email;
  end if;
end $$;

-- Confirmation. Should return one row with is_platform_admin = true.
-- (If you changed the email above, change it here too.)
select id, email, name, is_platform_admin
  from profiles
  where lower(email) = lower('robertmcasto@gmail.com');
