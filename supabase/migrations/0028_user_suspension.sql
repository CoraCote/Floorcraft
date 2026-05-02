-- 0028_user_suspension.sql
--
-- Per-user suspension. Distinct from team suspension (migration 0019,
-- which blocks office writes for an entire team) — this targets one
-- individual user across every team they're on.
--
-- Enforcement layers:
--   1. Supabase Auth's `auth.users.banned_until` is the load-bearing
--      block. Set via the admin-set-user-suspension Edge Function
--      using the service-role client; once set, Supabase's auth
--      middleware refuses the user's tokens (sign-in fails, refresh
--      fails, RPC calls 401).
--   2. The columns added here are the *audit trail* — who suspended
--      whom, when, and why. The Edge Function writes these via the
--      RPC below after flipping `banned_until`.
--
-- An admin can never suspend themselves (the RPC raises) — that
-- would lock the only person who could undo it.

alter table profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references profiles(id) on delete set null,
  add column if not exists suspended_reason text;

create index if not exists profiles_suspended_idx
  on profiles(suspended_at) where suspended_at is not null;

-- -----------------------------------------------------------------
-- Write path. Called by the Edge Function after it has flipped the
-- auth.users ban flag — *we* don't write to auth.users from SQL.
-- -----------------------------------------------------------------
create or replace function public.admin_set_user_suspension(
  p_user_id uuid,
  p_suspended boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  if p_user_id = v_actor then
    raise exception 'cannot_suspend_self';
  end if;

  if p_suspended then
    update profiles
      set suspended_at = now(),
          suspended_by = v_actor,
          suspended_reason = p_reason
      where id = p_user_id;
  else
    update profiles
      set suspended_at = null,
          suspended_by = null,
          suspended_reason = null
      where id = p_user_id;
  end if;

  -- audit trail. team_id is null because suspension is per-user, not
  -- per-team. Captures both the action and the reason so the audit
  -- log on the user-detail page tells the full story.
  insert into audit_events(team_id, actor_id, action, target_type, target_id, metadata)
  values (
    null,
    v_actor,
    case when p_suspended then 'admin.user.suspend' else 'admin.user.unsuspend' end,
    'profile',
    p_user_id::text,
    jsonb_strip_nulls(jsonb_build_object('reason', p_reason))
  );
end;
$$;

revoke all on function public.admin_set_user_suspension(uuid, boolean, text) from public;
grant execute on function public.admin_set_user_suspension(uuid, boolean, text) to authenticated;

-- -----------------------------------------------------------------
-- Re-create admin_get_user_detail to surface the suspension state
-- + reason on the user-detail page. Same shape as 0025 plus three
-- new top-level fields.
-- -----------------------------------------------------------------
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
    'suspended_at', p.suspended_at,
    'suspended_by', p.suspended_by,
    'suspended_reason', p.suspended_reason,
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
