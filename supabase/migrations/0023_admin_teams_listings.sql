-- 0023_admin_teams_listings.sql
--
-- Extends admin_list_teams() to include the suspension state and a
-- last-activity timestamp (max office.updated_at), so the admin
-- Teams page can:
--
--   - render a "Suspended" badge on every suspended row without
--     drilling in,
--   - filter the list to "active" / "suspended" / "all",
--   - sort by last activity to spot stale teams,
--   - show a "stale" hint on rows that haven't seen an office
--     update in 60+ days.
--
-- The shape is a strict superset of the old return columns, so the
-- existing AdminTeamRow type compiles unchanged once the new
-- columns are added; the UI cherry-picks the extras it cares about.
-- Idempotent: `create or replace`.

create or replace function public.admin_list_teams()
returns table (
  id uuid,
  slug text,
  name text,
  created_at timestamptz,
  member_count bigint,
  office_count bigint,
  is_suspended boolean,
  last_activity_at timestamptz
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
      coalesce(oc.c, 0) as office_count,
      coalesce(t.is_suspended, false) as is_suspended,
      la.last_activity_at
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
    left join (
      select team_id, max(updated_at) as last_activity_at
      from offices
      group by team_id
    ) la on la.team_id = t.id
    order by t.created_at desc;
end;
$$;

revoke all on function public.admin_list_teams() from public;
grant execute on function public.admin_list_teams() to authenticated;
