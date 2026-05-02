// deno-lint-ignore-file no-console
//
// Creates a Stripe Checkout session for a team's plan upgrade.
// Called from the team-side "Upgrade" / "Manage billing" UI; the
// caller posts `{ team_id, price_id, success_url, cancel_url }`.
// We:
//   1. Verify the caller is a team admin of `team_id` (so a member
//      can't subscribe a team they don't run).
//   2. Find or create the Stripe customer for the team.
//   3. Create a Checkout session with `subscription.metadata.team_id`
//      stamped on so the webhook can route the resulting
//      subscription back to the right row.
//
// Required env:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  — needed for the team-admin lookup
//                                AND the customer upsert.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const stripe = new Stripe(STRIPE_SECRET, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
})

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'unauthorized' }, 401)
  }

  // The user-scoped client lets us read who the caller is and
  // gate the request via the existing RLS plumbing (cheap +
  // auditable) before we mint anything in Stripe.
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await userClient.auth.getUser()
  const userId = userData?.user?.id
  const userEmail = userData?.user?.email
  if (!userId) {
    return json({ error: 'unauthorized' }, 401)
  }

  const { team_id, price_id, success_url, cancel_url } = await req
    .json()
    .catch(() => ({})) as {
      team_id?: string
      price_id?: string
      success_url?: string
      cancel_url?: string
    }
  if (!team_id || !price_id || !success_url || !cancel_url) {
    return json({ error: 'missing_args' }, 400)
  }

  // Team-admin check via service-role client (bypasses RLS).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: membership } = await admin
    .from('team_members')
    .select('role')
    .eq('team_id', team_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!membership || (membership as { role?: string }).role !== 'admin') {
    return json({ error: 'forbidden' }, 403)
  }

  // Find or create the Stripe customer. We key it off team_id so
  // a team that downgrades and re-upgrades reuses the same customer
  // record (and its saved card / billing history).
  const { data: subRow } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('team_id', team_id)
    .maybeSingle()
  let customerId = (subRow as { stripe_customer_id?: string } | null)
    ?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail ?? undefined,
      metadata: { team_id, created_by: userId },
    })
    customerId = customer.id
    // Insert a placeholder row so we have a customer mapping even
    // before the first subscription completes.
    await admin.from('billing_subscriptions').upsert({
      team_id,
      stripe_customer_id: customerId,
      status: 'inactive',
      plan: 'free',
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: price_id, quantity: 1 }],
    success_url,
    cancel_url,
    // The webhook depends on this metadata to route the resulting
    // subscription back to the right team row.
    subscription_data: {
      metadata: { team_id },
    },
    allow_promotion_codes: true,
  })

  return json({ url: session.url }, 200)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
