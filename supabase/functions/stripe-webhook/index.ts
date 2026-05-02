// deno-lint-ignore-file no-console
//
// Stripe webhook receiver. Wired in the Stripe Dashboard against
// /functions/v1/stripe-webhook with these events enabled:
//
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//   invoice.payment_succeeded
//
// We verify the Stripe signature, parse the relevant event types,
// and route to the upsert RPC. Source of truth stays Stripe; the
// `billing_subscriptions` table is just a denormalized read cache
// the app can render banners + gate features against without
// hitting Stripe on every request.
//
// Required env (set via `supabase secrets set …`):
//   STRIPE_SECRET_KEY             — sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET         — whsec_… from Stripe Dashboard
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY     — for the upsert RPC
//
// The team_id mapping comes from `subscription.metadata.team_id`
// which the team-side Checkout-session creator sets at create time.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const stripe = new Stripe(STRIPE_SECRET, {
  apiVersion: '2024-04-10',
  // Deno needs the explicit fetch client; the default Node http
  // adapter doesn't run in Edge Functions.
  httpClient: Stripe.createFetchHttpClient(),
})

const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return new Response('Missing stripe-signature', { status: 400 })
  }

  const body = await req.text()
  let event: Stripe.Event
  try {
    // Stripe SDK in Deno requires the async variant — `constructEvent`
    // does sync crypto unavailable in V8 isolates.
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      STRIPE_WEBHOOK_SECRET,
    )
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err)
    return new Response('Invalid signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubscriptionEvent(sub)
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        // The subscription update event will also fire with status =
        // past_due, so we just log here for telemetry. Future: send
        // an email through Resend.
        console.log('[stripe-webhook] payment failed', {
          customer: invoice.customer,
          subscription: invoice.subscription,
        })
        break
      }
      case 'invoice.payment_succeeded': {
        // Same — the subscription event carries the new period_end.
        // Logging only here; the upsert path handles state.
        console.log('[stripe-webhook] payment succeeded', {
          customer: (event.data.object as Stripe.Invoice).customer,
        })
        break
      }
      default:
        // Stripe sends a lot of events we don't care about
        // (price.updated, payment_intent.*, etc.). Acknowledge them
        // so Stripe doesn't retry; ignore the body.
        break
    }
  } catch (err) {
    console.error('[stripe-webhook] handler failed', { type: event.type, err })
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

async function handleSubscriptionEvent(sub: Stripe.Subscription) {
  // The team_id is stamped onto subscription metadata when the team-
  // side Checkout session is created. Without it, we can't route the
  // update to a row. Surface that loudly.
  const teamId = sub.metadata?.team_id
  if (!teamId) {
    console.error('[stripe-webhook] subscription missing team_id metadata', {
      subscription: sub.id,
      customer: sub.customer,
    })
    return
  }

  const plan = (sub.items.data[0]?.price?.id ?? 'free') as string
  const seats = sub.items.data[0]?.quantity ?? 0
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null

  const { error } = await admin.rpc('upsert_subscription_from_webhook', {
    p_team_id: teamId,
    p_stripe_customer_id: typeof sub.customer === 'string'
      ? sub.customer
      : sub.customer.id,
    p_stripe_subscription_id: sub.id,
    p_status: sub.status,
    p_plan: plan,
    p_seats: seats,
    p_current_period_end: currentPeriodEnd,
  })
  if (error) {
    console.error('[stripe-webhook] upsert RPC failed', error)
    throw error
  }
}
