-- catchup-admin-rpcs.sql
--
-- One-paste catch-up for a Supabase project that ran the original
-- bootstrap-platform-admin.sql (Phase 1 only) and is missing the
-- migrations that landed afterwards.
--
-- Symptom this script fixes:
--   ERROR: function public.admin_list_teams() does not exist
--   …or any of the *_office, *_subscription, set_team_suspended RPCs
--   the admin / billing UI calls into.
--
-- HOW TO USE
-- ----------
--   1. Open your Supabase project → SQL Editor → New query.
--   2. Paste this entire file → Run.
--   3. Sign in to the app → /admin → teams + users now load.
--
-- All four migrations are idempotent (`create or replace`,
-- `add column if not exists`, etc.), so re-running is safe.
--
-- Bundled migrations:
--   - 0018 admin_list_teams + admin_list_users (read RPCs)
--   - 0019 team suspension (column + trigger + RPCs)
--   - 0020 billing (subscriptions table + plans table + RPCs)
--   - 0021 office archive (column + RPCs)

-- ============================================================
-- 0018: admin team + user list RPCs
-- ============================================================

create or replace function public.admin_list_teams()
returns table (
  id uuid,
  slug text,
  name text,
  created_at timestamptz,
  member_count bigint,
  office_count bigint
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
      coalesce(oc.c, 0) as office_count
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
    order by t.created_at desc;
end;
$$;

revoke all on function public.admin_list_teams() from public;
grant execute on function public.admin_list_teams() to authenticated;

create or replace function public.admin_list_users(
  p_limit int default 200
)
returns table (
  id uuid,
  email text,
  name text,
  created_at timestamptz,
  is_platform_admin boolean,
  team_count bigint
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
      p.id,
      p.email,
      p.name,
      p.created_at,
      p.is_platform_admin,
      coalesce(tc.c, 0) as team_count
    from profiles p
    left join (
      select user_id, count(*)::bigint as c
      from team_members
      group by user_id
    ) tc on tc.user_id = p.id
    order by p.created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

revoke all on function public.admin_list_users(int) from public;
grant execute on function public.admin_list_users(int) to authenticated;


-- ============================================================
-- 0019: team suspension
-- ============================================================

alter table teams
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspension_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references profiles(id);

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
          suspension_reason = null,
          suspended_at = null,
          suspended_by = null
      where id = p_team_id;
  end if;
end;
$$;

revoke all on function public.admin_set_team_suspended(uuid, boolean, text) from public;
grant execute on function public.admin_set_team_suspended(uuid, boolean, text) to authenticated;

create or replace function public.admin_get_team_detail(p_team_id uuid)
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
    'id', t.id,
    'slug', t.slug,
    'name', t.name,
    'created_at', t.created_at,
    'is_suspended', t.is_suspended,
    'suspension_reason', t.suspension_reason,
    'suspended_at', t.suspended_at,
    'suspended_by_email', sb.email,
    'office_count', coalesce(oc.c, 0),
    'members', coalesce(mb.members, '[]'::jsonb)
  )
  into result
  from teams t
  left join profiles sb on sb.id = t.suspended_by
  left join (
    select team_id, count(*)::bigint as c
    from offices
    group by team_id
  ) oc on oc.team_id = t.id
  left join (
    select tm.team_id,
      jsonb_agg(jsonb_build_object(
        'user_id', tm.user_id,
        'email', p.email,
        'name', p.name,
        'role', tm.role,
        'created_at', tm.created_at
      ) order by tm.created_at) as members
    from team_members tm
    join profiles p on p.id = tm.user_id
    group by tm.team_id
  ) mb on mb.team_id = t.id
  where t.id = p_team_id;

  return result;
end;
$$;

revoke all on function public.admin_get_team_detail(uuid) from public;
grant execute on function public.admin_get_team_detail(uuid) to authenticated;

-- Trigger on offices: block writes when team is suspended.
create or replace function public.guard_team_not_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team_suspended boolean;
begin
  -- Platform admins bypass.
  if is_current_user_platform_admin() then
    return coalesce(new, old);
  end if;
  select is_suspended into team_suspended
  from teams
  where id = coalesce(new.team_id, old.team_id);
  if team_suspended then
    raise exception 'team_suspended' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists offices_team_not_suspended on offices;
create trigger offices_team_not_suspended
  before insert or update or delete on offices
  for each row execute function public.guard_team_not_suspended();


-- ============================================================
-- 0020: billing (subscriptions + plans + RPCs)
-- ============================================================

create table if not exists billing_subscriptions (
  team_id uuid primary key references teams(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  status text not null default 'inactive',
  plan text not null default 'free',
  seats int not null default 0,
  current_period_end timestamptz,
  override_plan text,
  override_until timestamptz,
  override_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists billing_subscriptions_status_idx
  on billing_subscriptions(status);

create table if not exists billing_plans (
  id text primary key,
  name text not null,
  price_cents int not null,
  currency text not null default 'usd',
  interval text not null default 'month',
  seat_limit int,
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0
);

alter table billing_subscriptions enable row level security;
alter table billing_plans enable row level security;

drop policy if exists billing_plans_public_read on billing_plans;
create policy billing_plans_public_read
  on billing_plans for select
  using (is_active and is_public);

drop policy if exists billing_subscriptions_admin_read on billing_subscriptions;
create policy billing_subscriptions_admin_read
  on billing_subscriptions for select
  to authenticated
  using (is_current_user_platform_admin());

create or replace function public.team_effective_plan(p_team_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    case
      when bs.override_until is not null
        and bs.override_until > clock_timestamp()
      then bs.override_plan
      else bs.plan
    end,
    'free'
  )
  from billing_subscriptions bs
  where bs.team_id = p_team_id;
$$;

revoke all on function public.team_effective_plan(uuid) from public;
grant execute on function public.team_effective_plan(uuid) to authenticated;

create or replace function public.team_get_subscription(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_member boolean;
  result jsonb;
begin
  select is_current_user_platform_admin() or exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid()
  ) into is_member;
  if not is_member then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'plan', team_effective_plan(p_team_id),
    'status', coalesce(bs.status, 'inactive'),
    'seats', coalesce(bs.seats, 0),
    'current_period_end', bs.current_period_end,
    'has_override', (bs.override_until is not null and bs.override_until > clock_timestamp()),
    'override_until', case
      when bs.override_until > clock_timestamp() then bs.override_until
      else null
    end
  )
  into result
  from billing_subscriptions bs
  where bs.team_id = p_team_id;

  return coalesce(result, jsonb_build_object(
    'plan', 'free',
    'status', 'inactive',
    'seats', 0,
    'current_period_end', null,
    'has_override', false,
    'override_until', null
  ));
end;
$$;

revoke all on function public.team_get_subscription(uuid) from public;
grant execute on function public.team_get_subscription(uuid) to authenticated;

create or replace function public.admin_list_subscriptions()
returns table (
  team_id uuid,
  team_name text,
  team_slug text,
  plan text,
  effective_plan text,
  status text,
  seats int,
  current_period_end timestamptz,
  has_override boolean,
  override_until timestamptz,
  override_reason text,
  stripe_customer_id text,
  stripe_subscription_id text
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
      t.id as team_id,
      t.name as team_name,
      t.slug as team_slug,
      bs.plan,
      team_effective_plan(t.id) as effective_plan,
      bs.status,
      bs.seats,
      bs.current_period_end,
      (bs.override_until is not null and bs.override_until > clock_timestamp()) as has_override,
      bs.override_until,
      bs.override_reason,
      bs.stripe_customer_id,
      bs.stripe_subscription_id
    from teams t
    left join billing_subscriptions bs on bs.team_id = t.id
    order by
      case coalesce(bs.status, 'inactive')
        when 'past_due' then 1
        when 'unpaid' then 2
        when 'incomplete' then 3
        when 'active' then 4
        when 'trialing' then 5
        when 'canceled' then 6
        else 7
      end,
      t.created_at desc;
end;
$$;

revoke all on function public.admin_list_subscriptions() from public;
grant execute on function public.admin_list_subscriptions() to authenticated;

create or replace function public.admin_override_subscription(
  p_team_id uuid,
  p_plan text,
  p_until timestamptz,
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

  insert into billing_subscriptions (team_id, stripe_customer_id, status, plan, override_plan, override_until, override_reason, updated_at)
  values (p_team_id, '', 'inactive', 'free', p_plan, p_until, nullif(btrim(coalesce(p_reason,'')),''), clock_timestamp())
  on conflict (team_id) do update set
    override_plan = excluded.override_plan,
    override_until = excluded.override_until,
    override_reason = excluded.override_reason,
    updated_at = clock_timestamp();
end;
$$;

revoke all on function public.admin_override_subscription(uuid, text, timestamptz, text) from public;
grant execute on function public.admin_override_subscription(uuid, text, timestamptz, text)
  to authenticated;

create or replace function public.admin_clear_subscription_override(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  update billing_subscriptions
    set override_plan = null, override_until = null, override_reason = null,
        updated_at = clock_timestamp()
    where team_id = p_team_id;
end;
$$;

revoke all on function public.admin_clear_subscription_override(uuid) from public;
grant execute on function public.admin_clear_subscription_override(uuid) to authenticated;

create or replace function public.upsert_subscription_from_webhook(
  p_team_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_plan text,
  p_seats int,
  p_current_period_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() not in ('service_role') then
    raise exception 'service_role_required';
  end if;

  insert into billing_subscriptions (
    team_id, stripe_customer_id, stripe_subscription_id, status,
    plan, seats, current_period_end, updated_at
  ) values (
    p_team_id, p_stripe_customer_id, p_stripe_subscription_id, p_status,
    p_plan, p_seats, p_current_period_end, clock_timestamp()
  )
  on conflict (team_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    status = excluded.status,
    plan = excluded.plan,
    seats = excluded.seats,
    current_period_end = excluded.current_period_end,
    updated_at = clock_timestamp();
end;
$$;

revoke all on function public.upsert_subscription_from_webhook(uuid, text, text, text, text, int, timestamptz) from public;


-- ============================================================
-- 0021: office archive
-- ============================================================

alter table offices
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references profiles(id);

create index if not exists offices_archived_idx
  on offices(team_id, archived_at) where archived_at is null;

create or replace function public.archive_office(p_office_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(office_perm_role(p_office_id), '') into caller_role;
  if caller_role not in ('owner', 'editor') and not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  update offices
    set archived_at = clock_timestamp(),
        archived_by = auth.uid()
    where id = p_office_id;
end;
$$;

revoke all on function public.archive_office(uuid) from public;
grant execute on function public.archive_office(uuid) to authenticated;

create or replace function public.unarchive_office(p_office_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select coalesce(office_perm_role(p_office_id), '') into caller_role;
  if caller_role not in ('owner', 'editor') and not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  update offices
    set archived_at = null,
        archived_by = null
    where id = p_office_id;
end;
$$;

revoke all on function public.unarchive_office(uuid) from public;
grant execute on function public.unarchive_office(uuid) to authenticated;
