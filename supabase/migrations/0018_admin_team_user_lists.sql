-- 0018_admin_team_user_lists.sql
--
-- Phase 2 (read) for the platform-admin surfaces. Two SECURITY
-- DEFINER RPCs that return enriched lists for the /admin/teams and
-- /admin/users pages. Same auth check the Phase 1 RPCs use.
--
-- Both queries do small joins / counts on bounded tables, no need
-- for a materialized view yet — single-digit-ms even at 100k rows.

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
