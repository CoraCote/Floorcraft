-- 0029_admin_user_audit.sql
--
-- Per-user audit feed for the admin user-detail page. Returns
-- events where the user was either the actor (they did the thing)
-- or the target (something was done to them). Targeted target
-- matching uses target_type='profile' AND target_id = user_id;
-- this catches admin grants/revokes (target_type='profile' from
-- 0017) and user suspend/unsuspend (target_type='profile' from
-- 0028). Future per-user actions should use the same target_type
-- so they appear here automatically.
--
-- Shape mirrors admin_list_platform_audit so the UI can reuse the
-- same row component.

create or replace function public.admin_list_user_audit(
  p_user_id uuid,
  p_limit int default 50
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
  created_at timestamptz,
  involvement text
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
      e.created_at,
      case
        when e.actor_id = p_user_id and e.target_type = 'profile' and e.target_id = p_user_id::text
          then 'self'
        when e.actor_id = p_user_id then 'actor'
        else 'target'
      end as involvement
    from audit_events e
    left join teams t on t.id = e.team_id
    left join profiles p on p.id = e.actor_id
    where e.actor_id = p_user_id
       or (e.target_type = 'profile' and e.target_id = p_user_id::text)
    order by e.created_at desc
    limit greatest(1, least(p_limit, 500));
end;
$$;

revoke all on function public.admin_list_user_audit(uuid, int) from public;
grant execute on function public.admin_list_user_audit(uuid, int) to authenticated;
