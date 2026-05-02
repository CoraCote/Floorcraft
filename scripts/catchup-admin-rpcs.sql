-- catchup-admin-rpcs.sql
--
-- The single file to paste into Supabase to bring a project up to
-- date with every admin-side migration. Idempotent end-to-end —
-- safe to re-paste after each release.
--
-- HOW TO USE
-- ----------
--   1. Open your Supabase project → SQL Editor → New query.
--   2. Paste this entire file → Run.
--   3. Sign in to the app → /admin → every page works.
--
-- Re-run any time after a release that adds a migration: this file
-- is updated in lock-step (regenerate via `./scripts/build-catchup.sh`),
-- so paste-and-go gets you current.
--
-- AUTO-GENERATED. Do not edit by hand — edit the source migration in
-- supabase/migrations/ and re-run scripts/build-catchup.sh.

-- ============================================================
-- 0018: admin team user lists
-- ============================================================
-- 0018_admin_team_user_lists.sql
--
-- Phase 2 (read) for the platform-admin surfaces. Two SECURITY
-- DEFINER RPCs that return enriched lists for the /admin/teams and
-- /admin/users pages. Same auth check the Phase 1 RPCs use.
--
-- Both queries do small joins / counts on bounded tables, no need
-- for a materialized view yet — single-digit-ms even at 100k rows.

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
-- 0019_team_suspension.sql
--
-- Sprint 1A — platform admins can suspend a team. Reversible (no
-- hard-delete). When suspended:
--   * Members can still SIGN IN and READ their data (so they can
--     export anything they need before action).
--   * All writes to office payloads + employees + share-tokens etc.
--     are blocked at the database via a row-level trigger.
--   * The client surfaces a banner explaining the state + the reason
--     the admin recorded.
--
-- This pattern intentionally diverges from "delete" — most of the
-- time we want a soft, reversible action; hard-delete is a separate
-- pipeline gated on GDPR / billing-collection workflows.

alter table teams
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspension_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references profiles(id);

create index if not exists teams_suspended_idx
  on teams(id) where is_suspended = true;

-- ----------------------------------------------------------------
-- Admin-only RPC: flip suspension on/off. SECURITY DEFINER + the
-- standard `is_current_user_platform_admin()` gate. Records the
-- actor + timestamp + a free-form reason so the team-side banner
-- can surface "Suspended Mar 4 because <reason>".
-- ----------------------------------------------------------------
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
    -- Unsuspending preserves the reason in case the admin reverts a
    -- decision and wants the history. The new banner won't show it
    -- because it gates on is_suspended; the audit log keeps it.
    update teams
      set is_suspended = false,
          suspended_at = null,
          suspended_by = null
      where id = p_team_id;
  end if;
end;
$$;

revoke all on function public.admin_set_team_suspended(uuid, boolean, text) from public;
grant execute on function public.admin_set_team_suspended(uuid, boolean, text)
  to authenticated;

-- ----------------------------------------------------------------
-- Admin-only RPC: bundle a team's detail (members + office count +
-- suspension state) for the /admin/teams/:id page. Single round
-- trip beats N selects.
-- ----------------------------------------------------------------
create or replace function public.admin_get_team_detail(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  team_row teams%rowtype;
  members jsonb;
  office_count int;
  suspended_by_email text;
begin
  if not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  select * into team_row from teams where id = p_team_id;
  if not found then
    raise exception 'team_not_found';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id', tm.user_id,
      'role', tm.role,
      'email', p.email,
      'name', p.name,
      'joined_at', tm.joined_at
    )
    order by tm.joined_at
  ), '[]'::jsonb)
  into members
  from team_members tm
  join profiles p on p.id = tm.user_id
  where tm.team_id = p_team_id;

  select count(*) into office_count from offices where team_id = p_team_id;

  if team_row.suspended_by is not null then
    select email into suspended_by_email
    from profiles where id = team_row.suspended_by;
  end if;

  return jsonb_build_object(
    'id', team_row.id,
    'slug', team_row.slug,
    'name', team_row.name,
    'created_at', team_row.created_at,
    'is_suspended', team_row.is_suspended,
    'suspension_reason', team_row.suspension_reason,
    'suspended_at', team_row.suspended_at,
    'suspended_by_email', suspended_by_email,
    'office_count', office_count,
    'members', members
  );
end;
$$;

revoke all on function public.admin_get_team_detail(uuid) from public;
grant execute on function public.admin_get_team_detail(uuid) to authenticated;

-- ----------------------------------------------------------------
-- Server-side enforcement: a trigger on `offices` that blocks any
-- INSERT / UPDATE / DELETE when the owning team is suspended. This
-- is the load-bearing guard — without it, suspension is just a
-- client-side banner, which any caller could bypass by hitting
-- supabase directly.
--
-- We hang it on offices (the largest write surface) for v1. Office-
-- adjacent tables (employees live in payload, share_tokens, etc.)
-- write through office_id and so transitively get covered as long as
-- they cascade through office RLS.
-- ----------------------------------------------------------------
create or replace function public.guard_team_not_suspended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_team_active boolean;
  team_id_to_check uuid;
begin
  -- Pick the right team_id depending on op + table shape. For
  -- offices we have NEW.team_id on insert/update; on delete the
  -- OLD row carries it.
  team_id_to_check := coalesce(NEW.team_id, OLD.team_id);
  if team_id_to_check is null then
    return coalesce(NEW, OLD);
  end if;

  -- Platform admins can mutate suspended teams' rows (e.g. to
  -- prepare for unsuspension). Skipping the check for them.
  if is_current_user_platform_admin() then
    return coalesce(NEW, OLD);
  end if;

  select not is_suspended into is_team_active
    from teams where id = team_id_to_check;

  if not coalesce(is_team_active, true) then
    raise exception 'team_suspended'
      using hint = 'Contact support to restore access.';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists offices_team_active_trigger on offices;
create trigger offices_team_active_trigger
  before insert or update or delete on offices
  for each row execute function guard_team_not_suspended();

-- ----------------------------------------------------------------
-- Reading the team's own suspension state needs to work for members
-- so the client banner can render. The existing teams RLS policy
-- (members can SELECT their team) covers it; this comment documents
-- the dependency.
-- ----------------------------------------------------------------

-- ============================================================
-- 0020: billing
-- ============================================================
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

-- ============================================================
-- 0021: office archive
-- ============================================================
-- 0021_office_archive.sql
--
-- Soft-delete for offices. The existing "Delete office" path is hard
-- and destructive — payload, share-tokens, employees all gone, and
-- you cannot undo it. Many operators want a middle ground: hide an
-- office from the team-home dashboard without losing the historical
-- data. That's archive.
--
-- Mechanic:
--   - `archived_at timestamptz`: null = active, non-null = archived.
--   - `listOffices` filters out archived by default; team-home gets a
--     "Show archived (N)" toggle to surface them.
--   - Archived offices are read-only at the application layer (the
--     UI hides edit affordances). For a hard server-side block,
--     unarchive first or hard-delete via the existing path.
--
-- Distinct from team suspension (#0019):
--   - Suspend is platform-admin-driven, applies to a whole team,
--     blocks WRITES at the database via trigger.
--   - Archive is team-owner-driven, applies to one office, hides it
--     in the UI but doesn't block writes server-side. The cost-of-
--     enforcement vs. cost-of-misuse tradeoff favors UI-only here.

alter table offices
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references profiles(id);

create index if not exists offices_archived_idx
  on offices(team_id, archived_at) where archived_at is null;

-- Owners + editors can archive / unarchive. We expose this as RPCs
-- (not raw UPDATE policies) so we can record `archived_by` in one
-- shot rather than asking the client to compute it.
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

-- ============================================================
-- 0022: admin launch wave
-- ============================================================
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

-- ============================================================
-- 0023: admin teams listings
-- ============================================================
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

-- ============================================================
-- 0024: admin team offices
-- ============================================================
-- 0024_admin_team_offices.sql
--
-- Admin-side office list per team. The existing `offices_read` RLS
-- policy gates SELECT to team members + (for private offices) people
-- with explicit office permissions. Platform admins are not auto-
-- members of every team, so they can't `select * from offices` for
-- arbitrary teams via RLS.
--
-- This RPC is the auditable seam: SECURITY DEFINER, gated by
-- is_current_user_platform_admin(), returns the columns the admin
-- team-detail page needs to render an offices list (id, slug, name,
-- is_private, archived_at, updated_at).

create or replace function public.admin_list_team_offices(p_team_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  is_private boolean,
  archived_at timestamptz,
  updated_at timestamptz
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
      o.id,
      o.slug,
      o.name,
      o.is_private,
      o.archived_at,
      o.updated_at
    from offices o
    where o.team_id = p_team_id
    order by o.archived_at nulls first, o.updated_at desc;
end;
$$;

revoke all on function public.admin_list_team_offices(uuid) from public;
grant execute on function public.admin_list_team_offices(uuid) to authenticated;

-- ============================================================
-- 0025: admin user detail
-- ============================================================
-- 0025_admin_user_detail.sql
--
-- Admin-side per-user detail. Returns the user's profile fields
-- alongside the list of teams they're a member of, with the role
-- per team and the team metadata an admin needs to triage:
-- "what teams is Alice on, in what role, since when?"
--
-- Single jsonb result (matches admin_get_team_detail's shape) so
-- the UI can pull the whole detail set in one round-trip.
--
-- SECURITY DEFINER, gated by is_current_user_platform_admin().

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

-- ============================================================
-- 0026: admin signups histogram
-- ============================================================
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
