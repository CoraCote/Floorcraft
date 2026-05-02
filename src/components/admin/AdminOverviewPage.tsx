import { useEffect, useState } from 'react'
import { Users, Building2, Layers, UserPlus, ShieldCheck } from 'lucide-react'
import { getPlatformOverview, type PlatformOverview } from '../../lib/platformAdmin'

/**
 * Read-only platform-overview dashboard. Pulls a single jsonb of
 * counts from `get_platform_overview` and renders six stat tiles
 * (users, teams, offices, signups 7d, signups 30d, admins). No
 * filters or drill-downs in Phase 1 — this is the "is the service
 * alive and growing?" glance.
 *
 * Refresh on mount only; the existing AuditLogPage already has its
 * own load cycle, and Phase 1 is a pure dashboard, so a refresh
 * button isn't load-bearing yet.
 */
export function AdminOverviewPage() {
  const [overview, setOverview] = useState<PlatformOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await getPlatformOverview()
      if (cancelled) return
      if (!result) {
        setError('Could not load platform overview.')
        return
      }
      setOverview(result)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Overview</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Top-level platform stats. No personal data on this page — drill into the
          team or user pages for that.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/40 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Tile
          label="Users"
          value={overview?.users}
          icon={<Users size={16} aria-hidden="true" />}
        />
        <Tile
          label="Teams"
          value={overview?.teams}
          icon={<Building2 size={16} aria-hidden="true" />}
        />
        <Tile
          label="Offices"
          value={overview?.offices}
          icon={<Layers size={16} aria-hidden="true" />}
        />
        <Tile
          label="Signups · last 7 days"
          value={overview?.signups_7d}
          icon={<UserPlus size={16} aria-hidden="true" />}
        />
        <Tile
          label="Signups · last 30 days"
          value={overview?.signups_30d}
          icon={<UserPlus size={16} aria-hidden="true" />}
        />
        <Tile
          label="Platform admins"
          value={overview?.admins}
          icon={<ShieldCheck size={16} aria-hidden="true" />}
        />
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  icon,
}: {
  label: string
  value: number | undefined
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {value === undefined ? '—' : value.toLocaleString()}
      </div>
    </div>
  )
}
