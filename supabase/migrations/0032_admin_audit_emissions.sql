-- 0032_admin_audit_emissions.sql
--
-- Until now, only the user-suspension RPC (0028) emitted an
-- audit_events row. Granting/revoking platform admin, suspending
-- a team, and deleting a team all silently mutated state without
-- leaving a trail — a real gap for incident-response.
--
-- This migration re-creates the four affected RPCs to emit a
-- structured audit row using the same `admin.<area>.<verb>` action
-- naming the user-suspension migration introduced. The
-- RecentAdminActionsCard on AdminOverviewPage filters on these
-- codes, so once this migration is applied + a new admin action
-- happens, the card lights up.
--
-- Action codes:
--   admin.platform_admin.grant
--   admin.platform_admin.revoke
--   admin.team.suspend
--   admin.team.unsuspend
--   admin.team.delete
--
-- Each row uses target_type='profile' or 'team' with target_id set
-- to the affected entity; metadata holds reason/before-state when
-- relevant.

-- -----------------------------------------------------------------
-- 1. grant_platform_admin — emit on success
-- -----------------------------------------------------------------
create or replace function public.grant_platform_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'user_not_found';
  end if;
  update profiles set is_platform_admin = true where id = p_user_id;

  insert into audit_events(team_id, actor_id, action, target_type, target_id, metadata)
  values (null, auth.uid(), 'admin.platform_admin.grant', 'profile', p_user_id::text, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------
-- 2. revoke_platform_admin — emit on success (after the lockout
-- guard already ran). Don't emit on the last_admin_protected
-- exception since the row never changed.
-- -----------------------------------------------------------------
create or replace function public.revoke_platform_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admin_count int;
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  select count(*) into remaining_admin_count
    from profiles
    where is_platform_admin = true and id <> p_user_id;
  if remaining_admin_count = 0 then
    raise exception 'last_admin_protected';
  end if;
  update profiles set is_platform_admin = false where id = p_user_id;

  insert into audit_events(team_id, actor_id, action, target_type, target_id, metadata)
  values (null, auth.uid(), 'admin.platform_admin.revoke', 'profile', p_user_id::text, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------
-- 3. admin_set_team_suspended — emit on every flip. Two action
-- codes (suspend / unsuspend) so the card can render appropriate
-- icons + tone, same pattern user suspension uses.
-- -----------------------------------------------------------------
create or replace function public.admin_set_team_suspended(
  p_team_id uuid,
  p_suspended boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from teams where id = p_team_id) then
    raise exception 'team_not_found';
  end if;

  if p_suspended then
    update teams
      set is_suspended = true,
          suspension_reason = nullif(btrim(coalesce(p_reason, '')), ''),
          suspended_at = clock_timestamp(),
          suspended_by = auth.uid()
      where id = p_team_id;
  else
    update teams
      set is_suspended = false,
          suspended_at = null,
          suspended_by = null
      where id = p_team_id;
  end if;

  insert into audit_events(team_id, actor_id, action, target_type, target_id, metadata)
  values (
    p_team_id,
    auth.uid(),
    case when p_suspended then 'admin.team.suspend' else 'admin.team.unsuspend' end,
    'team',
    p_team_id::text,
    jsonb_strip_nulls(jsonb_build_object('reason', p_reason))
  );
end;
$$;

-- -----------------------------------------------------------------
-- 4. admin_delete_team — emit BEFORE the cascade so the team_id is
-- still resolvable. The audit_events row's team_id FK points at the
-- team being deleted, so we set it to null in the row to survive
-- the cascade — the team's slug + name are captured in metadata.
-- -----------------------------------------------------------------
create or replace function public.admin_delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  team_exists boolean;
  v_slug text;
  v_name text;
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  select exists(select 1 from teams where id = p_team_id) into team_exists;
  if not team_exists then
    raise exception 'team_not_found';
  end if;

  select slug, name into v_slug, v_name from teams where id = p_team_id;

  insert into audit_events(team_id, actor_id, action, target_type, target_id, metadata)
  values (
    null,
    auth.uid(),
    'admin.team.delete',
    'team',
    p_team_id::text,
    jsonb_build_object('slug', v_slug, 'name', v_name)
  );

  delete from teams where id = p_team_id;
end;
$$;
