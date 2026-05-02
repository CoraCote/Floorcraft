import { useEffect, useState } from 'react'
import { CreditCard, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import {
  listPublicPlans,
  openCustomerPortal,
  startCheckout,
  teamGetSubscription,
  type PublicPlan,
  type TeamSubscription,
} from '../../lib/billing'
import type { Team } from '../../types/team'

interface Props {
  team: Team
  isAdmin: boolean
}

/**
 * Wave 22 (Sprint 2B): team-side billing surface. Members see the
 * plan + period-end at a glance; admins additionally get the
 * Subscribe / Manage Billing buttons that hand off to Stripe-hosted
 * Checkout / Customer Portal pages.
 *
 * Why redirect to Stripe-hosted UIs rather than rebuild billing
 * inside the app? The CEO/CPO synthesis decided "thin wrappers +
 * Stripe Dashboard links survive longer." Cards, invoices, dunning,
 * tax, refunds — Stripe's hosted surfaces handle all of it; we only
 * cache enough state in `billing_subscriptions` to gate features and
 * render banners. If we ever outgrow this, we can rebuild on top of
 * the same RPCs without changing the team-facing contract here.
 */
export function TeamSettingsBilling({ team, isAdmin }: Props) {
  const [sub, setSub] = useState<TeamSubscription | null>(null)
  const [plans, setPlans] = useState<PublicPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [s, p] = await Promise.all([
          teamGetSubscription(team.id),
          listPublicPlans(),
        ])
        if (cancelled) return
        setSub(s)
        setPlans(p)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [team.id])

  async function onManage() {
    setError(null)
    setBusy('manage')
    try {
      await openCustomerPortal({
        teamId: team.id,
        returnUrl: window.location.href,
      })
      // openCustomerPortal navigates the page on success — control
      // flow only reaches `finally` if it threw.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onSubscribe(priceId: string) {
    setError(null)
    setBusy(`buy:${priceId}`)
    try {
      const baseReturn = `${window.location.origin}/t/${team.slug}/settings/billing`
      await startCheckout({
        teamId: team.id,
        priceId,
        successUrl: `${baseReturn}?status=success`,
        cancelUrl: `${baseReturn}?status=cancel`,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <Loader2 size={14} aria-hidden="true" className="animate-spin" />
        Loading billing…
      </div>
    )
  }

  const isPaid = sub && sub.status !== 'inactive' && sub.status !== 'canceled'
  const showSubscribe = isAdmin && !isPaid && plans.length > 0

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CreditCard size={18} aria-hidden="true" />
          Billing
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Subscription, plan, and payment method for this team. Invoices
          and card management are handled in the Stripe customer portal.
        </p>
      </header>

      <CurrentPlanCard sub={sub} />

      {error && (
        <div
          role="alert"
          className="px-3 py-2 text-sm rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900/40"
        >
          {error}
        </div>
      )}

      {isAdmin && isPaid && (
        <button
          type="button"
          onClick={onManage}
          disabled={busy === 'manage'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[color:var(--color-blueprint)] hover:bg-[color:var(--color-blueprint-strong)] text-white rounded-md text-sm font-medium disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)] focus-visible:ring-offset-1"
        >
          {busy === 'manage' ? (
            <Loader2 size={14} aria-hidden="true" className="animate-spin" />
          ) : (
            <ExternalLink size={14} aria-hidden="true" />
          )}
          Manage billing
        </button>
      )}

      {showSubscribe && (
        <section aria-labelledby="plans-heading">
          <h3
            id="plans-heading"
            className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-2"
          >
            Available plans
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4 flex flex-col"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {p.name}
                  </h4>
                  <div className="font-mono text-base tabular-nums text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]">
                    {formatPrice(p.price_cents, p.currency)}
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-0.5">
                      /{p.interval}
                    </span>
                  </div>
                </div>
                {p.seat_limit != null && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Up to {p.seat_limit} seats
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void onSubscribe(p.id)}
                  disabled={busy?.startsWith('buy:') ?? false}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[color:var(--color-blueprint)] hover:bg-[color:var(--color-blueprint-strong)] text-white rounded-md text-sm font-medium disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)] focus-visible:ring-offset-1"
                >
                  {busy === `buy:${p.id}` ? (
                    <Loader2 size={14} aria-hidden="true" className="animate-spin" />
                  ) : (
                    <ShieldCheck size={14} aria-hidden="true" />
                  )}
                  Subscribe
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            You'll be redirected to Stripe Checkout — secure, PCI-compliant,
            and the page comes back here when you're done.
          </p>
        </section>
      )}

      {isAdmin && !isPaid && plans.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No public plans are configured yet. A platform admin can seed
          them via the Stripe dashboard and the <code>billing_plans</code> table.
        </p>
      )}

      {!isAdmin && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Only team admins can change the subscription. Ask a team admin
          to upgrade or update the payment method.
        </p>
      )}
    </div>
  )
}

function CurrentPlanCard({ sub }: { sub: TeamSubscription | null }) {
  const plan = sub?.plan ?? 'free'
  const status = sub?.status ?? 'inactive'
  const renews = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString()
    : null
  return (
    <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            Current plan
          </div>
          <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
            {humanPlan(plan)}
          </div>
        </div>
        <StatusPill status={status} />
      </div>
      {sub?.has_override && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          A platform admin has applied a complimentary override on this
          team's plan
          {sub.override_until
            ? ` (until ${new Date(sub.override_until).toLocaleDateString()})`
            : ''}
          .
        </p>
      )}
      {renews && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {status === 'canceled' ? 'Ends' : 'Renews'} on {renews}
        </p>
      )}
      {sub && sub.seats > 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {sub.seats} {sub.seats === 1 ? 'seat' : 'seats'}
        </p>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const m: Record<string, { label: string; cls: string }> = {
    active: {
      label: 'Active',
      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    trialing: {
      label: 'Trial',
      cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    },
    past_due: {
      label: 'Past due',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    },
    unpaid: {
      label: 'Unpaid',
      cls: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
    },
    incomplete: {
      label: 'Incomplete',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    },
    canceled: {
      label: 'Canceled',
      cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    },
    inactive: {
      label: 'No subscription',
      cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    },
  }
  const v = m[status] ?? m.inactive
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${v.cls}`}
    >
      {v.label}
    </span>
  )
}

function humanPlan(plan: string): string {
  if (plan === 'free') return 'Free'
  if (plan === 'comp') return 'Complimentary'
  // Stripe price IDs ('price_…') aren't human-readable; the
  // billing_plans row would carry the marketing name but we'd need
  // an extra join. A short truncation keeps the surface honest
  // until the join is wired.
  if (plan.startsWith('price_')) return 'Paid plan'
  return plan
}

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}
