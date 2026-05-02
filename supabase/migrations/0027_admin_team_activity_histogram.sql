-- 0027_admin_team_activity_histogram.sql
--
-- Per-day audit-event count for one team, used by the activity
-- sparkline on AdminTeamDetailPage. The team-detail page already
-- shows raw recent-events; this RPC backs the at-a-glance "is this
-- team busy or going dark?" trend without the admin having to scan
-- the full event list.
--
-- Mirrors `admin_signups_histogram` (migration 0026) — same shape,
-- same generate_series() pattern so empty days appear as zeros.

create or replace function public.admin_team_activity_histogram(
  p_team_id uuid,
  p_days int default 30
)
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

  if p_days is null or p_days < 1 then
    p_days := 30;
  end if;
  if p_days > 365 then
    p_days := 365;
  end if;

  with days as (
    select
      (current_date - (g.offset_days || ' days')::interval)::date as day
    from generate_series(0, p_days - 1) as g(offset_days)
  ),
  counts as (
    select
      date_trunc('day', created_at)::date as day,
      count(*)::int as count
    from audit_events
    where team_id = p_team_id
      and created_at >= current_date - ((p_days - 1) || ' days')::interval
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'count', coalesce(c.count, 0)
      )
      order by d.day asc
    ),
    '[]'::jsonb
  )
  into result
  from days d
  left join counts c on c.day = d.day;

  return result;
end;
$$;

revoke all on function public.admin_team_activity_histogram(uuid, int) from public;
grant execute on function public.admin_team_activity_histogram(uuid, int) to authenticated;
