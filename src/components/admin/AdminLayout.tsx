import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, Building2, ShieldCheck, CreditCard, History } from 'lucide-react'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getPlatformOverview, type PlatformOverview } from '../../lib/platformAdmin'
import { adminListSubscriptions } from '../../lib/billing'

/**
 * Two-pane shell for the platform-admin surfaces. Left rail =
 * navigation; right pane = nested route content.
 *
 * Loads the platform overview once on mount and surfaces the
 * counts as small chips on each nav item ("Teams 42"). Helps an
 * operator see at a glance whether the platform is alive without
 * clicking through.
 *
 * Wrapped in `RequirePlatformAdmin` at the route level so the
 * layout itself doesn't need to re-check the role.
 */
export function AdminLayout() {
  useDocumentTitle('Platform admin — Floorcraft')
  // Per-tab cache: load once on layout mount, share across the
  // nested admin routes. The Overview page also fetches its own
  // copy (with refresh button + last-updated timestamp); duplicating
  // the call costs a single extra round-trip and avoids the layout
  // having to know about the page's refresh state.
  const [overview, setOverview] = useState<PlatformOverview | null>(null)
  // At-risk subscription count for the Billing nav badge. Best-
  // effort: a project without the billing migration returns null,
  // and we just hide the indicator. We don't refetch as the user
  // navigates around — accepting the moment-of-load snapshot is
  // the right tradeoff for a sidebar dot that's a "look here"
  // signal, not a live counter.
  const [atRiskCount, setAtRiskCount] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void getPlatformOverview().then((o) => {
      if (!cancelled) setOverview(o)
    })
    void adminListSubscriptions()
      .then((subs) => {
        if (cancelled || !subs) return
        const count = subs.filter(
          (s) =>
            s.status === 'past_due' ||
            s.status === 'unpaid' ||
            s.status === 'incomplete',
        ).length
        setAtRiskCount(count)
      })
      .catch(() => {
        // Migration not applied yet — leave the indicator hidden.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex h-screen bg-[color:var(--color-paper)] dark:bg-gray-950">
      <aside className="w-56 flex-shrink-0 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 border-r border-[color:var(--color-paper-line)] dark:border-gray-800 flex flex-col">
        <div className="px-4 py-3 border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
            Platform admin
          </p>
        </div>
        <nav className="flex-1 px-2 py-2 space-y-0.5">
          <AdminNavLink to="/admin" end icon={<LayoutDashboard size={14} aria-hidden="true" />}>
            Overview
          </AdminNavLink>
          <AdminNavLink
            to="/admin/teams"
            icon={<Building2 size={14} aria-hidden="true" />}
            count={overview?.teams}
          >
            Teams
          </AdminNavLink>
          <AdminNavLink
            to="/admin/users"
            icon={<Users size={14} aria-hidden="true" />}
            count={overview?.users}
          >
            Users
          </AdminNavLink>
          <AdminNavLink
            to="/admin/admins"
            icon={<ShieldCheck size={14} aria-hidden="true" />}
            count={overview?.admins}
          >
            Admins
          </AdminNavLink>
          <AdminNavLink
            to="/admin/billing"
            icon={<CreditCard size={14} aria-hidden="true" />}
            alertCount={atRiskCount && atRiskCount > 0 ? atRiskCount : undefined}
            alertLabel="at-risk subscriptions"
          >
            Billing
          </AdminNavLink>
          <AdminNavLink to="/admin/audit" icon={<History size={14} aria-hidden="true" />}>
            Audit
          </AdminNavLink>
        </nav>
        <div className="px-4 py-3 border-t border-[color:var(--color-paper-line)] dark:border-gray-800">
          <NavLink
            to="/dashboard"
            className="text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
          >
            ← Back to app
          </NavLink>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

function AdminNavLink({
  to,
  end,
  icon,
  count,
  alertCount,
  alertLabel,
  children,
}: {
  to: string
  end?: boolean
  icon: React.ReactNode
  /** Optional count badge rendered on the right side of the link. */
  count?: number
  /** Amber alert chip — when set, replaces the neutral count chip
   *  and surfaces "something needs attention here" without an
   *  extra row in the sidebar. */
  alertCount?: number
  alertLabel?: string
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2 px-2.5 py-1.5 rounded text-sm transition-colors ${
          isActive
            ? 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] font-medium'
            : 'text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800'
        }`
      }
    >
      {icon}
      <span className="flex-1">{children}</span>
      {alertCount !== undefined ? (
        <span
          aria-label={`${alertCount} ${alertLabel ?? 'alerts'}`}
          title={`${alertCount} ${alertLabel ?? 'alerts'}`}
          className="font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {alertCount.toLocaleString()}
        </span>
      ) : count !== undefined ? (
        <span
          aria-label={`${count} ${count === 1 ? 'item' : 'items'}`}
          className="font-mono text-[10px] tabular-nums text-gray-400 dark:text-gray-500"
        >
          {count.toLocaleString()}
        </span>
      ) : null}
    </NavLink>
  )
}
