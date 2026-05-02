import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { adminListTeams, type AdminTeamRow } from '../../lib/adminLists'

/**
 * Read-only team list for platform admins. Each row links to the
 * team's home page (`/t/:slug`) — admins can already navigate any
 * team via team-admin RLS-bypassing policies, so this is the same
 * surface a member would see, not a separate admin detail view.
 *
 * Phase 2.5 (suspend / impersonate / detail) follows.
 */
export function AdminTeamsPage() {
  const [teams, setTeams] = useState<AdminTeamRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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

  const trimmedQuery = query.trim().toLowerCase()
  const visibleTeams = teams
    ? trimmedQuery
      ? teams.filter(
          (t) =>
            t.name.toLowerCase().includes(trimmedQuery) ||
            t.slug.toLowerCase().includes(trimmedQuery),
        )
      : teams
    : null

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Teams</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Every team on the platform. Click a team to open its home page.
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
          placeholder="Filter by name or slug…"
          aria-label="Filter teams"
          className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm pl-7 pr-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
        />
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
          {trimmedQuery ? `No teams match "${trimmedQuery}".` : 'No teams yet.'}
        </p>
      ) : (
        <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2 text-right">Members</th>
                <th className="px-3 py-2 text-right">Offices</th>
                <th className="px-3 py-2">Created</th>
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
