import { useEffect, useState } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { adminListUsers, type AdminUserRow } from '../../lib/adminLists'

/**
 * Read-only platform-wide user list. Newest signups first; client-
 * side filter narrows by email or name. Capped at 200 rows by
 * default (the RPC clamps the upper bound to 1000) — when the
 * platform passes that, server-side pagination + search lands.
 */
export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const list = await adminListUsers()
      if (cancelled) return
      if (list === null) {
        setError('Could not load user list.')
        setUsers([])
        return
      }
      setError(null)
      setUsers(list)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const trimmedQuery = query.trim().toLowerCase()
  const visibleUsers = users
    ? trimmedQuery
      ? users.filter((u) => {
          const haystack = [u.email, u.name ?? ''].join(' ').toLowerCase()
          return haystack.includes(trimmedQuery)
        })
      : users
    : null

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Users</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Newest signups first. Capped at 200 — server-side search lands when the
          platform passes that.
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
          placeholder="Filter by email or name…"
          aria-label="Filter users"
          className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm pl-7 pr-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
        />
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/40 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {visibleUsers === null ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : visibleUsers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {trimmedQuery ? `No users match "${trimmedQuery}".` : 'No users yet.'}
        </p>
      ) : (
        <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 text-right">Teams</th>
                <th className="px-3 py-2">Signed up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
              {visibleUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800/30">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-gray-900 dark:text-gray-100">{u.email}</span>
                      {u.is_platform_admin && (
                        <span
                          title="Platform admin"
                          className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] px-1 py-0.5 rounded bg-[color:var(--color-blueprint-soft)] dark:bg-gray-800"
                        >
                          <ShieldCheck size={9} aria-hidden="true" />
                          Admin
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                    {u.name?.trim() || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                    {u.team_count}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(u.created_at).toLocaleDateString()}
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
