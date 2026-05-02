import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from 'lucide-react'
import Papa from 'papaparse'
import { adminListTeams, type AdminTeamRow } from '../../lib/adminLists'
import { downloadCsv } from '../../lib/reports/csvExport'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

/**
 * Read-only team list for platform admins. Each row links to the
 * team's detail page (suspend / member browse / impersonate). The
 * page also offers:
 *   - a free-text filter (matches name + slug)
 *   - sortable column headers (click to toggle; click twice to flip)
 *   - one-click CSV export of the currently visible (filtered+sorted) rows
 */

type SortKey = 'name' | 'slug' | 'member_count' | 'office_count' | 'created_at'
type SortDir = 'asc' | 'desc'

export function AdminTeamsPage() {
  useDocumentTitle('Teams · Admin — Floorcraft')
  const [teams, setTeams] = useState<AdminTeamRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const list = await adminListTeams()
      if (cancelled) return
      if (list === null) {
        setError('Could not load team list.')
        setTeams([])
        return
      }
      setError(null)
      setTeams(list)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleTeams = useMemo(() => {
    if (!teams) return null
    const trimmed = query.trim().toLowerCase()
    const rows = trimmed
      ? teams.filter(
          (t) =>
            t.name.toLowerCase().includes(trimmed) ||
            t.slug.toLowerCase().includes(trimmed),
        )
      : teams.slice()
    rows.sort((a, b) => {
      const cmp = compareRows(a, b, sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [teams, query, sortKey, sortDir])

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Numeric / date columns default to descending so the highest /
      // most-recent values surface first; text columns default to asc.
      setSortDir(key === 'name' || key === 'slug' ? 'asc' : 'desc')
    }
  }

  function onExport() {
    if (!visibleTeams || visibleTeams.length === 0) return
    const csv = Papa.unparse(
      visibleTeams.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        members: t.member_count,
        offices: t.office_count,
        created_at: t.created_at,
      })),
      { columns: ['id', 'slug', 'name', 'members', 'offices', 'created_at'] },
    )
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`floorcraft-teams-${stamp}.csv`, csv)
  }

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Teams</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Every team on the platform. Click a team to open its admin detail page
          (suspend, member list, links to the team home).
        </p>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={12}
            aria-hidden="true"
            className="absolute left-2 top-2.5 text-gray-400 dark:text-gray-500"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or slug…"
            aria-label="Filter teams"
            className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm pl-7 pr-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
          />
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={!visibleTeams || visibleTeams.length === 0}
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

      {visibleTeams === null ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : visibleTeams.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {query.trim() ? `No teams match "${query.trim()}".` : 'No teams yet.'}
        </p>
      ) : (
        <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <SortHeader k="name" label="Name" sortKey={sortKey} sortDir={sortDir} onClick={onHeaderClick} />
                <SortHeader k="slug" label="Slug" sortKey={sortKey} sortDir={sortDir} onClick={onHeaderClick} />
                <SortHeader
                  k="member_count"
                  label="Members"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderClick}
                />
                <SortHeader
                  k="office_count"
                  label="Offices"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderClick}
                />
                <SortHeader
                  k="created_at"
                  label="Created"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderClick}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
              {visibleTeams.map((t) => (
                <tr key={t.id} className="hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800/30">
                  <td className="px-3 py-2">
                    <Link
                      to={`/admin/teams/${t.id}`}
                      className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">
                    {t.slug}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                    {t.member_count}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                    {t.office_count}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function compareRows(a: AdminTeamRow, b: AdminTeamRow, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name)
    case 'slug':
      return a.slug.localeCompare(b.slug)
    case 'member_count':
      return a.member_count - b.member_count
    case 'office_count':
      return a.office_count - b.office_count
    case 'created_at':
      return a.created_at.localeCompare(b.created_at)
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
