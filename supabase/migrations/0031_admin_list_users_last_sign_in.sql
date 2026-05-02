-- 0031_admin_list_users_last_sign_in.sql
--
-- Re-create admin_list_users() to surface `auth.users.last_sign_in_at`
-- so the AdminUsersPage list can show a Last-seen column and let
-- the operator filter on dormant accounts.
--
-- Why a SECURITY DEFINER join into auth: the auth schema isn't
-- queryable from the public RLS surface, but a SECURITY DEFINER
-- function with `set search_path = public` runs as the function
-- owner (postgres) which has access. This is the same pattern
-- the auth.admin.* helpers use server-side.
--
-- The function signature is the same int param; only the return
-- type grows. Postgres requires drop-then-create when the
-- return type changes.

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
  suspended_at timestamptz,
  last_sign_in_at timestamptz
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
      p.suspended_at,
      au.last_sign_in_at
    from profiles p
    left join (
      select user_id, count(*)::bigint as c
      from team_members
      group by user_id
    ) tc on tc.user_id = p.id
    left join auth.users au on au.id = p.id
    order by p.created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

revoke all on function public.admin_list_users(int) from public;
grant execute on function public.admin_list_users(int) to authenticated;
