-- 0024_admin_team_offices.sql
--
-- Admin-side office list per team. The existing `offices_read` RLS
-- policy gates SELECT to team members + (for private offices) people
-- with explicit office permissions. Platform admins are not auto-
-- members of every team, so they can't `select * from offices` for
-- arbitrary teams via RLS.
--
-- This RPC is the auditable seam: SECURITY DEFINER, gated by
-- is_current_user_platform_admin(), returns the columns the admin
-- team-detail page needs to render an offices list (id, slug, name,
-- is_private, archived_at, updated_at).

create or replace function public.admin_list_team_offices(p_team_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  is_private boolean,
  archived_at timestamptz,
  updated_at timestamptz
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
      o.id,
      o.slug,
      o.name,
      o.is_private,
      o.archived_at,
      o.updated_at
    from offices o
    where o.team_id = p_team_id
    order by o.archived_at nulls first, o.updated_at desc;
end;
$$;

revoke all on function public.admin_list_team_offices(uuid) from public;
grant execute on function public.admin_list_team_offices(uuid) to authenticated;
