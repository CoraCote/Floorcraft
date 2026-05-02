// deno-lint-ignore-file no-console
//
// Creates a Stripe Customer Portal session for a team admin to
// manage their subscription (update card, change plan, view
// invoices, cancel). The portal is the right surface for these —
// they're rarely-used flows that Stripe maintains for us.
//
// The team-side "Manage billing" button POSTs `{ team_id,
// return_url }`; we verify team-admin membership, look up the
// existing Stripe customer for that team, and return the portal
// URL. The client redirects to it.

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
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await userClient.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const { team_id, return_url } = await req.json().catch(() => ({})) as {
    team_id?: string
    return_url?: string
  }
  if (!team_id || !return_url) return json({ error: 'missing_args' }, 400)

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

  const { data: subRow } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('team_id', team_id)
    .maybeSingle()
  const customerId = (subRow as { stripe_customer_id?: string } | null)
    ?.stripe_customer_id
  if (!customerId) {
    return json({ error: 'no_customer' }, 404)
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url,
  })
  return json({ url: session.url }, 200)
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
