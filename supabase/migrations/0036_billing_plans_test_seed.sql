-- 0036_billing_plans_test_seed.sql
--
-- Seeds three test billing plans into the billing_plans table.
-- Deliberately under-priced so this is OBVIOUSLY a test (real Pro
-- pricing tends to land at $19-49/mo; ours is $1-5/mo here). The
-- ids are placeholder Stripe price IDs; replace them with the real
-- `price_…` ids from the Stripe dashboard once Stripe is set up.
--
-- The plans are gated to is_public = false so they don't surface
-- on the public pricing page yet — only admins poking the admin
-- billing surface or a manually-flipped row will see them. Flip
-- `is_public = true` after replacing the placeholder ids with real
-- Stripe price ids.
--
-- Idempotent: ON CONFLICT DO NOTHING so re-running doesn't clobber
-- a row that's been hand-edited (e.g. you've replaced the placeholder
-- id with a real Stripe id and bumped the price).

insert into billing_plans (id, name, price_cents, currency, interval, seat_limit, is_public, is_active, sort_order)
values
  ('price_test_starter', 'Starter (test)',  100, 'usd', 'month',   5, false, true, 10),
  ('price_test_team',    'Team (test)',     300, 'usd', 'month',  25, false, true, 20),
  ('price_test_pro',     'Pro (test)',      500, 'usd', 'month', null, false, true, 30)
on conflict (id) do nothing;
