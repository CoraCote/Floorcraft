import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, History, RefreshCw, Search, X as XIcon } from 'lucide-react'
import Papa from 'papaparse'
import {
  adminListPlatformAudit,
  type PlatformAuditRow,
} from '../../lib/adminLaunch'
import { downloadCsv } from '../../lib/reports/csvExport'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/**
 * Platform-wide audit log. The team-scoped AuditLogPage shows one
 * team's events; this surface walks every team and is the operator's
 * "what just happened across the platform?" feed.
 *
 * Filters are pure-server (the RPC accepts since/action/actor_id) so
 * the result set is bounded and consistent regardless of how many
 * teams exist. Missing migration 0022 → the RPC returns an error;
 * the page surfaces a friendly notice with a hint rather than just
 * a stack trace.
 */

export function AdminAuditPage() {
  useDocumentTitle('Audit · Admin — Floorcraft')
  const [rows, setRows] = useState<PlatformAuditRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // `?team=<id>` deep-links scope the audit feed to a single team
  // (links from AdminTeamDetailPage land here). Read on mount so a
  // refresh keeps the scope; the operator can clear it from the
  // header chip.
  const [searchParams, setSearchParams] = useSearchParams()
  const teamScope = searchParams.get('team')

  // Filters. Empty string → don't filter on that field.
  const [query, setQuery] = useState('') // free-text across actor / team / action
  const [actionFilter, setActionFilter] = useState('')
  const [sinceDays, setSinceDays] = useState<'7' | '30' | '90' | 'all'>('30')

  // "Load older" bumps the row limit. The RPC caps at 200/query, so
  // we re-fetch with a larger limit each time. Filter changes reset
  // it back to the default — handled in the change handlers below
  // (avoiding a setState-in-effect cycle for the React 19 lint).
  const PAGE_SIZE = 200
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [hasMore, setHasMore] = useState(false)

  function onChangeSinceDays(v: '7' | '30' | '90' | 'all') {
    setSinceDays(v)
    setLimit(PAGE_SIZE)
  }
  function onChangeActionFilter(v: string) {
    setActionFilter(v)
    setLimit(PAGE_SIZE)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since = sinceDays === 'all'
        ? undefined
        : new Date(
            Date.now() - parseInt(sinceDays, 10) * 24 * 60 * 60 * 1000,
          ).toISOString()
      const result = await adminListPlatformAudit({
        limit,
        since,
        action: actionFilter || undefined,
      })
      if (cancelled) return
      setRefreshing(false)
      setLoading(false)
      if (result === null) {
        setError(
          'Could not load platform audit. Migration 0022 may not be applied yet — paste scripts/catchup-admin-rpcs.sql into Supabase SQL editor.',
        )
        setRows([])
        setHasMore(false)
        return
      }
      setError(null)
      setRows(result)
      setHasMore(result.length >= limit)
      setLastUpdated(new Date())
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sinceDays, actionFilter, refreshNonce, limit])

  // Distinct actions present in the loaded rows — drives the
  // action-filter dropdown so the operator only sees actions
  // that exist in the current window.
  const distinctActions = useMemo(() => {
    if (!rows) return []
    return Array.from(new Set(rows.map((r) => r.action))).sort()
  }, [rows])

  const visibleRows = useMemo(() => {
    if (!rows) return null
    let result = rows
    // Team scope (from ?team=<id>) is applied first — it's a hard
    // narrowing, not an OR with other filters.
    if (teamScope) {
      result = result.filter((r) => r.team_id === teamScope)
    }
    const trimmed = query.trim().toLowerCase()
    if (trimmed) {
      result = result.filter((r) =>
        [r.actor_email ?? '', r.team_name ?? '', r.team_slug ?? '', r.action]
          .join(' ')
          .toLowerCase()
          .includes(trimmed),
      )
    }
    return result
  }, [rows, query, teamScope])

  // Display name for the team-scope chip — pull from the first
  // event we have for that team. May be undefined for the brief
  // window before rows load; the chip falls back to the raw id.
  const scopedTeamLabel = useMemo(() => {
    if (!teamScope || !rows) return null
    const first = rows.find((r) => r.team_id === teamScope)
    return first?.team_name ?? first?.team_slug ?? teamScope.slice(0, 8)
  }, [teamScope, rows])

  function clearTeamScope() {
    const next = new URLSearchParams(searchParams)
    next.delete('team')
    setSearchParams(next, { replace: true })
  }

  function onRefresh() {
    setRefreshing(true)
    setRefreshNonce((n) => n + 1)
  }

  function onExport() {
    if (!visibleRows || visibleRows.length === 0) return
    const csv = Papa.unparse(
      visibleRows.map((r) => ({
        created_at: r.created_at,
        team_slug: r.team_slug ?? '',
        team_name: r.team_name ?? '',
        actor_email: r.actor_email ?? '',
        actor_id: r.actor_id ?? '',
        action: r.action,
        target_type: r.target_type ?? '',
        target_id: r.target_id ?? '',
        metadata: r.metadata ? JSON.stringify(r.metadata) : '',
      })),
      {
        columns: [
          'created_at',
          'team_slug',
          'team_name',
          'actor_email',
          'actor_id',
          'action',
          'target_type',
          'target_id',
          'metadata',
        ],
      },
    )
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`floorcraft-platform-audit-${stamp}.csv`, csv)
  }

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <History size={20} aria-hidden="true" />
            Platform audit
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Cross-team audit feed. Default window is 30 days; bumped via
            the dropdown below. Capped at 200 events per query.
          </p>
          {teamScope && (
            <button
              type="button"
              onClick={clearTeamScope}
              title="Clear team scope and show all teams"
              className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] dark:bg-gray-800 text-xs hover:underline"
            >
              <span className="font-mono">team:</span>
              <span className="font-medium">{scopedTeamLabel}</span>
              <XIcon size={11} aria-hidden="true" className="ml-0.5" />
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm border border-[color:var(--color-paper-line)] dark:border-gray-700 rounded text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw
              size={12}
              aria-hidden="true"
              className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''}
            />
            Refresh
          </button>
          {lastUpdated && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[16rem] max-w-md">
          <Search
            size={12}
            aria-hidden="true"
            className="absolute left-2 top-2.5 text-gray-400 dark:text-gray-500"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by actor / team / action…"
            aria-label="Filter audit events"
            className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm pl-7 pr-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
          <span>Window</span>
          <select
            value={sinceDays}
            onChange={(e) =>
              onChangeSinceDays(e.target.value as '7' | '30' | '90' | 'all')
            }
            className="rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
          >
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
          <span>Action</span>
          <select
            value={actionFilter}
            onChange={(e) => onChangeActionFilter(e.target.value)}
            className="rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
          >
            <option value="">All</option>
            {distinctActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onExport}
          disabled={!visibleRows || visibleRows.length === 0}
          title="Download visible rows as CSV"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm border border-[color:var(--color-paper-line)] dark:border-gray-700 rounded text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={12} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : !visibleRows || visibleRows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {query.trim() || actionFilter
            ? 'No events match the current filter.'
            : 'No audit events in this window.'}
        </p>
      ) : (
        <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
              {visibleRows.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800/30"
                >
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    <span title={new Date(r.created_at).toUTCString()}>
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.team_id ? (
                      <Link
                        to={`/admin/teams/${r.team_id}`}
                        className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
                      >
                        {r.team_name ?? r.team_slug ?? r.team_id}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.actor_email ? (
                      <Link
                        to={`/admin/users?q=${encodeURIComponent(r.actor_email)}`}
                        className="text-gray-700 dark:text-gray-200 hover:underline"
                        title={`Find ${r.actor_email} on the Users page`}
                      >
                        {r.actor_email}
                      </Link>
                    ) : (
                      <span className="text-gray-400">{r.actor_id ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-[11px] text-gray-700 dark:text-gray-200">
                      {r.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {r.target_type ? (
                      <span>
                        {r.target_type}
                        {r.target_id ? `: ${r.target_id.slice(0, 8)}` : ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="flex items-center justify-center border-t border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-sunken)] dark:bg-gray-900/50 px-3 py-2">
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                disabled={loading || refreshing}
                className="text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline disabled:opacity-50 disabled:no-underline"
              >
                Load {PAGE_SIZE} older
              </button>
            </div>
          )}
        </div>
      )}

      {visibleRows && visibleRows.length > 0 && (
        <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
          Showing {visibleRows.length} of {rows?.length ?? 0} loaded
          {hasMore ? ' (more available)' : ''}
        </p>
      )}
    </div>
  )
}
