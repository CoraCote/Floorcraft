-- 0030_admin_list_users_suspension.sql
--
-- Re-create admin_list_users() to surface the per-user suspension
-- state (added in migration 0028) so the AdminUsersPage list can
-- show a Suspended badge and filter on it. The function signature
-- doesn't change — same int param — so existing callers compile;
-- only the row shape grows by one nullable column.
--
-- Postgres requires the function to be dropped before re-declaring
-- it with a different return type. CASCADE isn't needed because
-- nothing else depends on it.

drop function if exists public.admin_list_users(int);

create function public.admin_list_users(
  p_limit int default 200
)
returns table (
  id uuid,
  email text,
  name text,
  created_at timestamptz,
  is_platform_admin boolean,
  team_count bigint,
  suspended_at timestamptz
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
      coalesce(tc.c, 0) as team_count,
      p.suspended_at
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
