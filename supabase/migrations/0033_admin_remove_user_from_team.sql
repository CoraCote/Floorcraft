-- 0033_admin_remove_user_from_team.sql
--
-- Per-user, per-team membership removal on behalf of a platform
-- admin. Currently the only path to "remove someone from a team"
-- is the team-side TeamSettings page, which requires the admin to
-- be a member of that team. A platform admin investigating a user
-- across many teams shouldn't have to join each team to offboard
-- the user; this RPC bypasses the team-membership requirement via
-- SECURITY DEFINER, gated as usual on is_current_user_platform_admin().
--
-- Guards:
--   - The membership row must exist (returns silently if not — the
--     UI already shows the row, so a missing one means a race we
--     can ignore).
--   - If removing the row would leave the team with zero admins,
--     raise `last_team_admin_protected` so the platform admin
--     doesn't accidentally orphan an active team. The platform
--     admin can still delete the team if that's the intent — this
--     just stops the silent footgun where they meant "remove this
--     person" and got "lock everyone out of writes".
--
-- Audit emission uses the same admin.<area>.<verb> shape introduced
-- in migrations 0028 + 0032 so the RecentAdminActionsCard picks it
-- up automatically.

create or replace function public.admin_remove_user_from_team(
  p_user_id uuid,
  p_team_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_remaining_admins int;
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  select role into v_role
    from team_members
    where team_id = p_team_id and user_id = p_user_id;
  if v_role is null then
    -- Already gone — no-op, no audit row.
    return;
  end if;

  if v_role = 'admin' then
    select count(*) into v_remaining_admins
      from team_members
      where team_id = p_team_id
        and role = 'admin'
        and user_id <> p_user_id;
    if v_remaining_admins = 0 then
      raise exception 'last_team_admin_protected';
    end if;
  end if;

  delete from team_members
    where team_id = p_team_id and user_id = p_user_id;

  insert into audit_events(team_id, actor_id, action, target_type, target_id, metadata)
  values (
    p_team_id,
    v_actor,
    'admin.team.member_remove',
    'profile',
    p_user_id::text,
    jsonb_build_object('role', v_role)
  );
end;
$$;

revoke all on function public.admin_remove_user_from_team(uuid, uuid) from public;
grant execute on function public.admin_remove_user_from_team(uuid, uuid) to authenticated;
