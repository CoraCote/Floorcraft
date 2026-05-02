-- 0020_billing.sql
--
-- Stripe billing scaffold. Two tables + admin/team RPCs.
--
-- Strategy (per CEO/CPO synthesis): "thin wrappers + Stripe Dashboard
-- links survive longer." We cache the minimum subscription state we
-- need to render banners + gate features, and link out to Stripe
-- Dashboard for invoices, refunds, dunning, etc. Source of truth is
-- Stripe; this table is a denormalized read cache populated by the
-- stripe-webhook Edge Function.
--
-- Subscription lifecycle states we track (mirrors Stripe's vocab):
--   trialing | active | past_due | canceled | unpaid | incomplete

-- ----------------------------------------------------------------
-- Maps a team_id to its Stripe customer + subscription objects.
-- One row per team that's ever been linked to Stripe (free tiers
-- don't get a row until they upgrade).
-- ----------------------------------------------------------------
create table if not exists billing_subscriptions (
  team_id uuid primary key references teams(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  status text not null default 'inactive',
  -- Plan identifier — matches Stripe price IDs. 'free' / 'comp' are
  -- local sentinels for non-Stripe-tracked teams.
  plan text not null default 'free',
  -- Seat count (employees in the team). Some plans price per-seat;
  -- the webhook updates this from the subscription's `quantity`.
  seats int not null default 0,
  current_period_end timestamptz,
  -- Manual-override hatch from the CEO/CPO synthesis. When non-null,
  -- the override wins over Stripe state until the date passes. The
  -- admin UI sets `override_plan` + `override_until` together with a
  -- reason in `override_reason`.
  override_plan text,
  override_until timestamptz,
  override_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists billing_subscriptions_status_idx
  on billing_subscriptions(status);

-- ----------------------------------------------------------------
-- Local cache of Stripe products/prices. Populated either by hand
-- (run the seed at the bottom of bootstrap-billing.sql) or by a
-- future "sync from Stripe" admin RPC.
-- ----------------------------------------------------------------
create table if not exists billing_plans (
  id text primary key,                  -- Stripe price ID, e.g. 'price_1ABC'
  name text not null,                   -- 'Pro', 'Team', etc.
  price_cents int not null,             -- in the smallest unit (cents)
  currency text not null default 'usd',
  interval text not null default 'month', -- 'month' | 'year'
  seat_limit int,                       -- null = unlimited
  -- Public-facing — gates whether the team-side pricing page lists
  -- this plan. Internal/comp plans set this to false.
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0
);

alter table billing_subscriptions enable row level security;
alter table billing_plans enable row level security;

-- Plans table is publicly readable (active + public rows).
drop policy if exists billing_plans_public_read on billing_plans;
create policy billing_plans_public_read
  on billing_plans for select
  using (is_active and is_public);

-- Subscriptions: only platform admins read directly. Team-side
-- access goes through the `team_get_subscription` RPC below so we
-- can trim the row + skip override fields the team shouldn't see.
drop policy if exists billing_subscriptions_admin_read on billing_subscriptions;
create policy billing_subscriptions_admin_read
  on billing_subscriptions for select
  to authenticated
  using (is_current_user_platform_admin());

-- ----------------------------------------------------------------
-- Effective plan for a team: applies the override if active, else
-- falls back to the Stripe-cached plan, else 'free'.
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Team-side: the team's own subscription state. Members can read
-- their team's plan + status; sensitive fields (override_reason,
-- stripe_customer_id) are stripped.
-- ----------------------------------------------------------------
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
  -- Membership check. Platform admins bypass.
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

-- ----------------------------------------------------------------
-- Admin-only: list subscriptions across the platform. Joined to
-- teams for display; ordered by status + plan so paying customers
-- and at-risk accounts surface first.
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Admin-only: comp / grant / override a team's plan. Supports
-- "give Acme a free Pro plan for 90 days" workflows. Setting
-- p_until = null clears the override.
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Admin-only: clear an override (shortcut for `… (team_id, null,
-- null, null)`). Lets the admin UI offer a one-click "remove
-- override" button.
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Webhook-side: upsert a subscription state. Called only from the
-- stripe-webhook Edge Function via the service role key (which
-- bypasses RLS). Keeping it as a SECURITY DEFINER RPC means we can
-- audit + validate in one place rather than scattering raw upserts
-- through the function.
-- ----------------------------------------------------------------
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
  -- Service role only — anonymous / authenticated callers should
  -- never hit this. We also protect the RPC behind a revoke at the
  -- end so even a leaked anon key can't call it.
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
-- NB: no grant. Only the service role can call this; service role
-- bypasses RLS but is required by the auth.role() check above.
