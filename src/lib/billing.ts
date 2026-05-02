import { supabase } from './supabase'

export type SubscriptionStatus =
  | 'inactive'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'

export interface AdminSubscription {
  team_id: string
  team_name: string
  team_slug: string
  plan: string | null
  effective_plan: string
  status: SubscriptionStatus | null
  seats: number | null
  current_period_end: string | null
  has_override: boolean
  override_until: string | null
  override_reason: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export interface TeamSubscription {
  plan: string
  status: SubscriptionStatus
  seats: number
  current_period_end: string | null
  has_override: boolean
  override_until: string | null
}

export async function adminListSubscriptions(): Promise<AdminSubscription[] | null> {
  const { data, error } = await supabase.rpc('admin_list_subscriptions')
  if (error) {
    console.warn('[billing] admin list failed', error)
    return null
  }
  return (data ?? []) as AdminSubscription[]
}

export async function teamGetSubscription(teamId: string): Promise<TeamSubscription | null> {
  const { data, error } = await supabase.rpc('team_get_subscription', {
    p_team_id: teamId,
  })
  if (error) {
    console.warn('[billing] team get failed', error)
    return null
  }
  return data as TeamSubscription
}

export async function adminOverrideSubscription(args: {
  teamId: string
  plan: string
  until: string | null
  reason?: string
}): Promise<{ kind: 'ok' } | { kind: 'error'; message: string }> {
  const { error } = await supabase.rpc('admin_override_subscription', {
    p_team_id: args.teamId,
    p_plan: args.plan,
    p_until: args.until,
    p_reason: args.reason ?? null,
  })
  if (error) return { kind: 'error', message: error.message }
  return { kind: 'ok' }
}

export async function adminClearSubscriptionOverride(
  teamId: string,
): Promise<{ kind: 'ok' } | { kind: 'error'; message: string }> {
  const { error } = await supabase.rpc('admin_clear_subscription_override', {
    p_team_id: teamId,
  })
  if (error) return { kind: 'error', message: error.message }
  return { kind: 'ok' }
}

/**
 * Mints a Stripe Checkout session for the team's plan upgrade and
 * redirects the browser to it. Returns nothing on success (the
 * page navigation happens); throws on hard failure so the caller
 * can surface a toast.
 */
export async function startCheckout(args: {
  teamId: string
  priceId: string
  successUrl: string
  cancelUrl: string
}): Promise<void> {
  const session = await supabase.auth.getSession()
  const accessToken = session.data.session?.access_token
  if (!accessToken) throw new Error('Not authenticated')

  const url = new URL('/functions/v1/stripe-checkout', getFunctionsBase())
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      team_id: args.teamId,
      price_id: args.priceId,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Checkout failed (${res.status})`)
  }
  const { url: checkoutUrl } = (await res.json()) as { url: string }
  window.location.href = checkoutUrl
}

/**
 * Mints a Stripe Customer Portal session and redirects to it.
 * Used by the team's "Manage billing" button to update payment
 * method, change plan, view invoices, cancel.
 */
export async function openCustomerPortal(args: {
  teamId: string
  returnUrl: string
}): Promise<void> {
  const session = await supabase.auth.getSession()
  const accessToken = session.data.session?.access_token
  if (!accessToken) throw new Error('Not authenticated')

  const url = new URL('/functions/v1/stripe-portal', getFunctionsBase())
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      team_id: args.teamId,
      return_url: args.returnUrl,
    }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Portal failed (${res.status})`)
  }
  const { url: portalUrl } = (await res.json()) as { url: string }
  window.location.href = portalUrl
}

function getFunctionsBase(): string {
  // Edge Functions hang off the same Supabase project URL the rest
  // of the app uses. We pull from VITE_SUPABASE_URL — same env
  // variable the supabase client reads.
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base) throw new Error('VITE_SUPABASE_URL is not set')
  return base
}
