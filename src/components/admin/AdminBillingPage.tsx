import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CreditCard,
  Download,
  RefreshCw,
  Search,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import Papa from 'papaparse'
import {
  adminListSubscriptions,
  adminClearSubscriptionOverride,
  type AdminSubscription,
} from '../../lib/billing'
import { downloadCsv } from '../../lib/reports/csvExport'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ConfirmDialog } from '../editor/ConfirmDialog'

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
type SortKey = 'team_name' | 'effective_plan' | 'status' | 'seats' | 'current_period_end'
type SortDir = 'asc' | 'desc'

const STATUS_RANK: Record<string, number> = {
  past_due: 1,
  unpaid: 2,
  incomplete: 3,
  active: 4,
  trialing: 5,
  canceled: 6,
  inactive: 7,
}

export function AdminBillingPage() {
  useDocumentTitle('Billing · Admin — Floorcraft')
  const [subs, setSubs] = useState<AdminSubscription[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [atRiskOnly, setAtRiskOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const list = await adminListSubscriptions()
      if (cancelled) return
      setRefreshing(false)
      if (list === null) {
        setError('Could not load subscriptions.')
        setSubs([])
        return
      }
      setError(null)
      setSubs(list)
      setLastUpdated(new Date())
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshNonce])

  function onRefresh() {
    setRefreshing(true)
    setRefreshNonce((n) => n + 1)
  }

  const trimmedQuery = query.trim().toLowerCase()
  const visibleSubs = useMemo(() => {
    if (!subs) return null
    let rows = trimmedQuery
      ? subs.filter((s) =>
          [s.team_name, s.team_slug, s.plan ?? '', s.effective_plan]
            .join(' ')
            .toLowerCase()
            .includes(trimmedQuery),
        )
      : subs.slice()
    if (atRiskOnly) {
      rows = rows.filter(
        (s) =>
          s.status === 'past_due' ||
          s.status === 'unpaid' ||
          s.status === 'incomplete',
      )
    }
    rows.sort((a, b) => {
      const cmp = compareSubs(a, b, sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [subs, trimmedQuery, atRiskOnly, sortKey, sortDir])

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Status defaults asc (past_due → trialing); seats / period
      // default desc (highest first); text columns default asc.
      setSortDir(
        key === 'team_name' || key === 'effective_plan' || key === 'status'
          ? 'asc'
          : 'desc',
      )
    }
  }

  // Per-status counts across the *unfiltered* subs — the strip shows
  // platform health regardless of what the operator is currently
  // searching for (filtering would make "5 past-due" disappear when
  // they search for one team and mislead them about overall risk).
  const statusCounts = useMemo(() => {
    const seed: Record<string, number> = {
      active: 0,
      trialing: 0,
      past_due: 0,
      unpaid: 0,
      incomplete: 0,
      canceled: 0,
      inactive: 0,
    }
    if (!subs) return seed
    for (const s of subs) {
      const k = s.status ?? 'inactive'
      seed[k] = (seed[k] ?? 0) + 1
    }
    return seed
  }, [subs])

  const atRiskCount =
    statusCounts.past_due + statusCounts.unpaid + statusCounts.incomplete

  // Clearing an override flips the team back to whatever Stripe says
  // — that can be a meaningful access change ("comp Pro plan ends
  // immediately"), so two-step confirm prevents an accidental click.
  const [pendingClear, setPendingClear] = useState<AdminSubscription | null>(null)
  const [clearBusy, setClearBusy] = useState(false)

  async function onConfirmClear() {
    if (!pendingClear || clearBusy) return
    setClearBusy(true)
    const result = await adminClearSubscriptionOverride(pendingClear.team_id)
    setClearBusy(false)
    setPendingClear(null)
    if (result.kind === 'error') {
      setError(result.message)
      return
    }
    setRefreshNonce((n) => n + 1)
  }

  function onExport() {
    if (!visibleSubs || visibleSubs.length === 0) return
    const csv = Papa.unparse(
      visibleSubs.map((s) => ({
        team_id: s.team_id,
        team_slug: s.team_slug,
        team_name: s.team_name,
        plan: s.plan ?? '',
        effective_plan: s.effective_plan,
        status: s.status ?? 'inactive',
        seats: s.seats ?? 0,
        current_period_end: s.current_period_end ?? '',
        has_override: s.has_override ? 'true' : 'false',
        override_until: s.override_until ?? '',
        override_reason: s.override_reason ?? '',
        stripe_customer_id: s.stripe_customer_id ?? '',
        stripe_subscription_id: s.stripe_subscription_id ?? '',
      })),
      {
        columns: [
          'team_id',
          'team_slug',
          'team_name',
          'plan',
          'effective_plan',
          'status',
          'seats',
          'current_period_end',
          'has_override',
          'override_until',
          'override_reason',
          'stripe_customer_id',
          'stripe_subscription_id',
        ],
      },
    )
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`floorcraft-subscriptions-${stamp}.csv`, csv)
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

      {subs && subs.length > 0 && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"
          aria-label="Subscription status summary"
        >
          <SummaryTile
            label="Active"
            value={statusCounts.active + statusCounts.trialing}
            tone="ok"
            hint={
              statusCounts.trialing > 0
                ? `${statusCounts.trialing} on trial`
                : undefined
            }
          />
          <SummaryTile
            label="At risk"
            value={atRiskCount}
            tone={atRiskCount > 0 ? 'warn' : 'muted'}
            hint={
              atRiskCount > 0
                ? `past_due ${statusCounts.past_due} · unpaid ${statusCounts.unpaid} · incomplete ${statusCounts.incomplete}`
                : 'No risky subscriptions'
            }
          />
          <SummaryTile
            label="Canceled"
            value={statusCounts.canceled}
            tone="muted"
          />
          <SummaryTile
            label="Free / no sub"
            value={statusCounts.inactive}
            tone="muted"
            hint={`${subs.length} teams total`}
          />
        </div>
      )}

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[16rem] max-w-sm">
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
        <label
          className={`flex items-center gap-1.5 text-xs select-none cursor-pointer ${
            atRiskCount > 0
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-gray-500 dark:text-gray-400'
          }`}
          title="Past due, unpaid, or incomplete subscriptions"
        >
          <input
            type="checkbox"
            checked={atRiskOnly}
            onChange={(e) => setAtRiskOnly(e.target.checked)}
            className="accent-amber-600"
          />
          At risk only
          {atRiskCount > 0 && (
            <span className="font-mono tabular-nums opacity-90">({atRiskCount})</span>
          )}
        </label>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title={
            lastUpdated
              ? `Last updated ${lastUpdated.toLocaleTimeString()}`
              : 'Reload subscription data'
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm border border-[color:var(--color-paper-line)] dark:border-gray-700 rounded text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
        >
          <RefreshCw
            size={12}
            aria-hidden="true"
            className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''}
          />
          Refresh
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!visibleSubs || visibleSubs.length === 0}
          title="Download visible rows as CSV"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm border border-[color:var(--color-paper-line)] dark:border-gray-700 rounded text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
        >
          <Download size={12} aria-hidden="true" />
          Export CSV
        </button>
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
                <SortHeader k="team_name" label="Team" sortKey={sortKey} sortDir={sortDir} onClick={onHeaderClick} />
                <SortHeader k="effective_plan" label="Plan" sortKey={sortKey} sortDir={sortDir} onClick={onHeaderClick} />
                <SortHeader k="status" label="Status" sortKey={sortKey} sortDir={sortDir} onClick={onHeaderClick} />
                <SortHeader
                  k="seats"
                  label="Seats"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderClick}
                />
                <SortHeader k="current_period_end" label="Renews" sortKey={sortKey} sortDir={sortDir} onClick={onHeaderClick} />
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
                        onClick={() => setPendingClear(s)}
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

      {pendingClear && (
        <ConfirmDialog
          title={`Clear comp override on "${pendingClear.team_name}"?`}
          body={
            <div className="space-y-2">
              <p>
                The team will revert to whatever its Stripe subscription
                says. If their override was carrying their access (no
                paid subscription), they&rsquo;ll drop to the free tier
                immediately.
              </p>
              {pendingClear.override_reason && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Reason on file: <em>{pendingClear.override_reason}</em>
                </p>
              )}
            </div>
          }
          confirmLabel={clearBusy ? 'Clearing…' : 'Clear override'}
          cancelLabel="Cancel"
          tone="danger"
          onConfirm={() => {
            if (clearBusy) return
            void onConfirmClear()
          }}
          onCancel={() => {
            if (clearBusy) return
            setPendingClear(null)
          }}
        />
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: number
  tone: 'ok' | 'warn' | 'muted'
  hint?: string
}) {
  const valueClass =
    tone === 'ok'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-gray-700 dark:text-gray-200'
  return (
    <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-3">
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl font-medium tabular-nums ${valueClass}`}>
        {value.toLocaleString()}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{hint}</div>
      )}
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

function compareSubs(a: AdminSubscription, b: AdminSubscription, key: SortKey): number {
  switch (key) {
    case 'team_name':
      return a.team_name.localeCompare(b.team_name)
    case 'effective_plan':
      return a.effective_plan.localeCompare(b.effective_plan)
    case 'status': {
      const ar = STATUS_RANK[a.status ?? 'inactive'] ?? 99
      const br = STATUS_RANK[b.status ?? 'inactive'] ?? 99
      return ar - br
    }
    case 'seats':
      return (a.seats ?? 0) - (b.seats ?? 0)
    case 'current_period_end':
      return (a.current_period_end ?? '').localeCompare(b.current_period_end ?? '')
  }
}

function SortHeader({
  k,
  label,
  align,
  sortKey,
  sortDir,
  onClick,
}: {
  k: SortKey
  label: string
  align?: 'right'
  sortKey: SortKey
  sortDir: SortDir
  onClick: (k: SortKey) => void
}) {
  const isActive = sortKey === k
  const Icon = !isActive ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onClick(k)}
        aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`inline-flex items-center gap-1 transition-colors ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${
          isActive
            ? 'text-gray-900 dark:text-gray-100'
            : 'hover:text-gray-700 dark:hover:text-gray-300'
        }`}
      >
        <span>{label}</span>
        <Icon size={11} aria-hidden="true" className={isActive ? 'opacity-100' : 'opacity-40'} />
      </button>
    </th>
  )
}
