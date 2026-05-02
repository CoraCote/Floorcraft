-- 0026_admin_signups_histogram.sql
--
-- Per-day signup histogram for the platform-admin Overview page.
-- The Overview already shows scalar 7d/30d counts; this RPC backs
-- the trend chart so the admin can see whether signups are
-- accelerating, flat, or have stalled.
--
-- Uses generate_series() so days with zero signups still appear
-- in the result (a flat zero is informative; a missing day is a
-- chart gap that lies). The RPC returns the most recent N days,
-- ordered ascending by day so the client can render left→right.

create or replace function public.admin_signups_histogram(
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
    from profiles
    where created_at >= current_date - ((p_days - 1) || ' days')::interval
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

revoke all on function public.admin_signups_histogram(int) from public;
grant execute on function public.admin_signups_histogram(int) to authenticated;
