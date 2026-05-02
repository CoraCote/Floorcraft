-- 0025_admin_user_detail.sql
--
-- Admin-side per-user detail. Returns the user's profile fields
-- alongside the list of teams they're a member of, with the role
-- per team and the team metadata an admin needs to triage:
-- "what teams is Alice on, in what role, since when?"
--
-- Single jsonb result (matches admin_get_team_detail's shape) so
-- the UI can pull the whole detail set in one round-trip.
--
-- SECURITY DEFINER, gated by is_current_user_platform_admin().

create or replace function public.admin_get_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'name', p.name,
    'created_at', p.created_at,
    'is_platform_admin', coalesce(p.is_platform_admin, false),
    'teams', coalesce(t.teams, '[]'::jsonb)
  )
  into result
  from profiles p
  left join (
    select tm.user_id,
      jsonb_agg(
        jsonb_build_object(
          'team_id', tm.team_id,
          'team_name', tt.name,
          'team_slug', tt.slug,
          'role', tm.role,
          'joined_at', tm.created_at,
          'is_suspended', coalesce(tt.is_suspended, false)
        ) order by tm.created_at desc
      ) as teams
    from team_members tm
    join teams tt on tt.id = tm.team_id
    group by tm.user_id
  ) t on t.user_id = p.id
  where p.id = p_user_id;

  return result;
end;
$$;

revoke all on function public.admin_get_user_detail(uuid) from public;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;
