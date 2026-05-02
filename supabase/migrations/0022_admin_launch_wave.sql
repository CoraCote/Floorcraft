-- 0022_admin_launch_wave.sql
--
-- Launch-readiness wave for the platform-admin surface. Three RPCs
-- + one delete cascade helper that unlock real operational features:
--
--   1. admin_list_platform_audit() — cross-team audit feed for the
--      "what happened on the platform recently?" question. Without
--      this, platform admins have only the team-scoped audit log.
--
--   2. admin_team_usage(team_id) — payload size, member count, and
--      audit row count for a single team. Surfaces abusive accounts
--      and storage hotspots before they become a billing question.
--
--   3. admin_delete_team(team_id) — force-delete from the admin
--      surface. Currently only a team owner can delete via team
--      settings; admins need this for ToS violations / abandoned
--      teams. Cascades through teams + offices + members + audit
--      via the existing FK on-delete-cascade chain.
--
-- All three follow the existing pattern: SECURITY DEFINER, gated by
-- is_current_user_platform_admin(), revoke from public + grant to
-- authenticated.

-- ============================================================
-- 1. Platform-wide audit feed
-- ============================================================

create or replace function public.admin_list_platform_audit(
  p_limit int default 100,
  p_since timestamptz default null,
  p_action text default null,
  p_actor_id uuid default null
)
returns table (
  id uuid,
  team_id uuid,
  team_slug text,
  team_name text,
  actor_id uuid,
  actor_email text,
  action text,
  target_type text,
  target_id text,
  metadata jsonb,
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
    select
      e.id,
      e.team_id,
      t.slug as team_slug,
      t.name as team_name,
      e.actor_id,
      p.email as actor_email,
      e.action,
      e.target_type,
      e.target_id,
      e.metadata,
      e.created_at
    from audit_events e
    left join teams t on t.id = e.team_id
    left join profiles p on p.id = e.actor_id
    where (p_since is null or e.created_at >= p_since)
      and (p_action is null or e.action = p_action)
      and (p_actor_id is null or e.actor_id = p_actor_id)
    order by e.created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

revoke all on function public.admin_list_platform_audit(int, timestamptz, text, uuid) from public;
grant execute on function public.admin_list_platform_audit(int, timestamptz, text, uuid) to authenticated;


-- ============================================================
-- 2. Per-team usage stats
-- ============================================================

create or replace function public.admin_team_usage(p_team_id uuid)
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
    -- Office count + total payload bytes (approximated by JSON
    -- text length, which is what supabase stores it as on disk
    -- after toasting). This is a "good enough for ops" number,
    -- not a precise byte count.
    'office_count', coalesce(o.office_count, 0),
    'archived_office_count', coalesce(o.archived_count, 0),
    'payload_bytes', coalesce(o.payload_bytes, 0),
    'member_count', coalesce(m.member_count, 0),
    'audit_event_count', coalesce(a.event_count, 0),
    'last_audit_at', a.last_audit_at,
    'last_office_update_at', o.last_update_at
  )
  into result
  from teams t
  left join (
    select
      team_id,
      count(*)::bigint as office_count,
      count(*) filter (where archived_at is not null)::bigint as archived_count,
      sum(octet_length(payload::text))::bigint as payload_bytes,
      max(updated_at) as last_update_at
    from offices
    group by team_id
  ) o on o.team_id = t.id
  left join (
    select team_id, count(*)::bigint as member_count
    from team_members
    group by team_id
  ) m on m.team_id = t.id
  left join (
    select
      team_id,
      count(*)::bigint as event_count,
      max(created_at) as last_audit_at
    from audit_events
    group by team_id
  ) a on a.team_id = t.id
  where t.id = p_team_id;

  return result;
end;
$$;

revoke all on function public.admin_team_usage(uuid) from public;
grant execute on function public.admin_team_usage(uuid) to authenticated;


-- ============================================================
-- 3. Admin force-delete a team
-- ============================================================

create or replace function public.admin_delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  team_exists boolean;
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  select exists(select 1 from teams where id = p_team_id) into team_exists;
  if not team_exists then
    raise exception 'team_not_found';
  end if;

  -- Cascade is already configured at the FK level on every table
  -- that points at teams. We let the database walk the graph; this
  -- function exists so the admin doesn't need direct DELETE
  -- privilege on the teams table (RLS) and so we have a single
  -- audit-friendly seam for the action.
  delete from teams where id = p_team_id;
end;
$$;

revoke all on function public.admin_delete_team(uuid) from public;
grant execute on function public.admin_delete_team(uuid) to authenticated;
