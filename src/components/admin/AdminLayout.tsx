import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, Building2, ShieldCheck, CreditCard } from 'lucide-react'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getPlatformOverview, type PlatformOverview } from '../../lib/platformAdmin'

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
  useEffect(() => {
    let cancelled = false
    void getPlatformOverview().then((o) => {
      if (!cancelled) setOverview(o)
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
          <AdminNavLink to="/admin/billing" icon={<CreditCard size={14} aria-hidden="true" />}>
            Billing
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
  children,
}: {
  to: string
  end?: boolean
  icon: React.ReactNode
  /** Optional count badge rendered on the right side of the link. */
  count?: number
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
      {count !== undefined && (
        <span
          aria-label={`${count} ${count === 1 ? 'item' : 'items'}`}
          className="font-mono text-[10px] tabular-nums text-gray-400 dark:text-gray-500"
        >
          {count.toLocaleString()}
        </span>
      )}
    </NavLink>
  )
}
