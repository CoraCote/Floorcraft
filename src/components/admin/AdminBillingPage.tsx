import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Search, AlertTriangle, Sparkles } from 'lucide-react'
import {
  adminListSubscriptions,
  adminClearSubscriptionOverride,
  type AdminSubscription,
} from '../../lib/billing'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/**
 * Platform-admin billing surface. Lists every team with their
 * Stripe subscription state — plan, status, seats, period end,
 * any active override. Sorted server-side so at-risk accounts
 * (past_due / unpaid / incomplete) surface first.
 *
 * For everything beyond viewing + clearing overrides (refunds,
 * dunning, invoice detail), the row links out to the Stripe
 * Dashboard customer page. Per the CEO/CPO synthesis: thin
 * wrappers + Stripe Dashboard links survive longer than rebuilt
 * billing UI.
 */
export function AdminBillingPage() {
  useDocumentTitle('Billing · Admin — Floorcraft')
  const [subs, setSubs] = useState<AdminSubscription[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const list = await adminListSubscriptions()
      if (cancelled) return
      if (list === null) {
        setError('Could not load subscriptions.')
        setSubs([])
        return
      }
      setError(null)
      setSubs(list)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshNonce])

  const trimmedQuery = query.trim().toLowerCase()
  const visibleSubs = subs
    ? trimmedQuery
      ? subs.filter((s) =>
          [s.team_name, s.team_slug, s.plan ?? '', s.effective_plan]
            .join(' ')
            .toLowerCase()
            .includes(trimmedQuery),
        )
      : subs
    : null

  async function onClearOverride(teamId: string) {
    const result = await adminClearSubscriptionOverride(teamId)
    if (result.kind === 'error') {
      setError(result.message)
      return
    }
    setRefreshNonce((n) => n + 1)
  }

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CreditCard size={20} aria-hidden="true" />
          Billing
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Stripe subscription state per team. At-risk accounts (past-due / unpaid)
          sort first. For refunds, invoices, and dunning, click out to the Stripe
          Dashboard customer page.
        </p>
      </header>

      <div className="mb-3 relative max-w-sm">
        <Search
          size={12}
          aria-hidden="true"
          className="absolute left-2 top-2.5 text-gray-400 dark:text-gray-500"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by team or plan…"
          aria-label="Filter subscriptions"
          className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm pl-7 pr-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
        />
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/40 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {visibleSubs === null ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : visibleSubs.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {trimmedQuery ? `No teams match "${trimmedQuery}".` : 'No teams.'}
        </p>
      ) : (
        <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Seats</th>
                <th className="px-3 py-2">Renews</th>
                <th className="px-3 py-2">Stripe</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
              {visibleSubs.map((s) => (
                <tr key={s.team_id} className="hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800/30">
                  <td className="px-3 py-2">
                    <Link
                      to={`/admin/teams/${s.team_id}`}
                      className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
                    >
                      {s.team_name}
                    </Link>
                    <div className="font-mono text-[10px] text-gray-400">{s.team_slug}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-gray-900 dark:text-gray-100">{s.effective_plan}</span>
                    {s.has_override && (
                      <span
                        className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.5 rounded"
                        title={s.override_reason ?? 'Override active'}
                      >
                        <Sparkles size={9} aria-hidden="true" />
                        Override
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={s.status} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                    {s.seats ?? 0}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {s.current_period_end
                      ? new Date(s.current_period_end).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.stripe_customer_id ? (
                      <a
                        href={`https://dashboard.stripe.com/customers/${s.stripe_customer_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
                      >
                        Open ↗
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {s.has_override && (
                      <button
                        type="button"
                        onClick={() => onClearOverride(s.team_id)}
                        className="text-[11px] text-amber-700 dark:text-amber-300 hover:underline"
                        title="Clear override"
                      >
                        Clear override
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50 p-4">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <AlertTriangle size={14} aria-hidden="true" />
          Stripe setup checklist
        </h2>
        <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600 dark:text-gray-300">
          <li>
            Apply migration <code>0020_billing.sql</code> to the database.
          </li>
          <li>
            In Supabase dashboard → Settings → Edge Functions → Secrets, set
            <code className="mx-1">STRIPE_SECRET_KEY</code> and
            <code className="mx-1">STRIPE_WEBHOOK_SECRET</code>.
          </li>
          <li>
            Deploy the edge functions:
            <code className="mx-1">supabase functions deploy stripe-webhook stripe-checkout stripe-portal</code>
          </li>
          <li>
            In Stripe Dashboard, create a webhook pointed at
            <code className="mx-1">/functions/v1/stripe-webhook</code> with events
            <code className="mx-1">customer.subscription.created/updated/deleted</code>
            and the <code>invoice.payment_*</code> pair.
          </li>
          <li>
            Insert your prices into <code>billing_plans</code> so the team-side
            upgrade UI can list them.
          </li>
        </ol>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: AdminSubscription['status'] }) {
  if (!status || status === 'inactive') {
    return <span className="text-[10px] uppercase tracking-wider text-gray-400">inactive</span>
  }
  const tone =
    status === 'active' || status === 'trialing'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
      : status === 'past_due' || status === 'unpaid' || status === 'incomplete'
        ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {status}
    </span>
  )
}
