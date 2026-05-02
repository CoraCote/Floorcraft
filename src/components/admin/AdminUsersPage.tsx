import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search, ShieldCheck, ShieldOff } from 'lucide-react'
import Papa from 'papaparse'
import { adminListUsers, type AdminUserRow } from '../../lib/adminLists'
import { grantPlatformAdmin, revokePlatformAdmin } from '../../lib/platformAdmin'
import { downloadCsv } from '../../lib/reports/csvExport'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ConfirmDialog } from '../editor/ConfirmDialog'

/**
 * Read-only platform-wide user list. Newest signups first; client-
 * side filter narrows by email or name. Capped at 200 rows by
 * default (the RPC clamps the upper bound to 1000) — when the
 * platform passes that, server-side pagination + search lands.
 *
 * Wave 22B adds:
 *   - Sortable column headers (click to toggle, click twice to flip).
 *   - "Admins only" toggle for finding platform admins quickly.
 *   - One-click CSV export of the currently visible rows.
 */

type SortKey = 'email' | 'name' | 'team_count' | 'created_at'
type SortDir = 'asc' | 'desc'

export function AdminUsersPage() {
  useDocumentTitle('Users · Admin — Floorcraft')
  // Honour `?q=…` on initial mount so cross-page links (e.g. a
  // member email click on AdminTeamDetailPage) can deep-link
  // straight into the user list with a pre-filled filter. We only
  // read this once: subsequent typing in the search input owns the
  // query state without writing back to the URL.
  const [searchParams] = useSearchParams()
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [adminsOnly, setAdminsOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [refreshNonce, setRefreshNonce] = useState(0)
  // Pending action target for the grant/revoke confirm dialog. Same
  // safety pattern as #241 — we always confirm before flipping a
  // platform-admin flag.
  const [pending, setPending] = useState<
    | { kind: 'grant' | 'revoke'; user: AdminUserRow }
    | null
  >(null)
  const [actionBusy, setActionBusy] = useState(false)

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
  }, [refreshNonce])

  const visibleUsers = useMemo(() => {
    if (!users) return null
    const trimmed = query.trim().toLowerCase()
    let rows = trimmed
      ? users.filter((u) => {
          const haystack = [u.email, u.name ?? ''].join(' ').toLowerCase()
          return haystack.includes(trimmed)
        })
      : users.slice()
    if (adminsOnly) rows = rows.filter((u) => u.is_platform_admin)
    rows.sort((a, b) => {
      const cmp = compareRows(a, b, sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [users, query, adminsOnly, sortKey, sortDir])

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'email' || key === 'name' ? 'asc' : 'desc')
    }
  }

  async function onConfirmAction() {
    if (!pending || actionBusy) return
    setActionBusy(true)
    const result =
      pending.kind === 'grant'
        ? await grantPlatformAdmin(pending.user.id)
        : await revokePlatformAdmin(pending.user.id)
    setActionBusy(false)
    setPending(null)
    if (result.kind === 'error') {
      setError(result.message)
      return
    }
    setError(null)
    setRefreshNonce((n) => n + 1)
  }

  function onExport() {
    if (!visibleUsers || visibleUsers.length === 0) return
    const csv = Papa.unparse(
      visibleUsers.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name ?? '',
        is_platform_admin: u.is_platform_admin ? 'true' : 'false',
        teams: u.team_count,
        created_at: u.created_at,
      })),
      {
        columns: ['id', 'email', 'name', 'is_platform_admin', 'teams', 'created_at'],
      },
    )
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`floorcraft-users-${stamp}.csv`, csv)
  }

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Users</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Newest signups first. Capped at 200 — server-side search lands when the
          platform passes that.
        </p>
      </header>

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
            placeholder="Filter by email or name…"
            aria-label="Filter users"
            className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm pl-7 pr-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={adminsOnly}
            onChange={(e) => setAdminsOnly(e.target.checked)}
            className="accent-[color:var(--color-blueprint)]"
          />
          Admins only
        </label>
        <button
          type="button"
          onClick={onExport}
          disabled={!visibleUsers || visibleUsers.length === 0}
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

      {visibleUsers === null ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : visibleUsers.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {query.trim() || adminsOnly
            ? 'No users match the current filter.'
            : 'No users yet.'}
        </p>
      ) : (
        <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <SortHeader k="email" label="Email" sortKey={sortKey} sortDir={sortDir} onClick={onHeaderClick} />
                <SortHeader k="name" label="Name" sortKey={sortKey} sortDir={sortDir} onClick={onHeaderClick} />
                <SortHeader
                  k="team_count"
                  label="Teams"
                  align="right"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderClick}
                />
                <SortHeader
                  k="created_at"
                  label="Signed up"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onClick={onHeaderClick}
                />
                <th className="px-3 py-2 text-right" aria-label="Actions" />
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
                  <td className="px-3 py-2 text-right">
                    {u.is_platform_admin ? (
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'revoke', user: u })}
                        title="Revoke platform admin"
                        className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 px-2 py-1 rounded"
                      >
                        <ShieldOff size={11} aria-hidden="true" />
                        Revoke
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'grant', user: u })}
                        title="Grant platform admin"
                        className="inline-flex items-center gap-1 text-[11px] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:bg-[color:var(--color-blueprint-soft)] dark:hover:bg-gray-800 px-2 py-1 rounded"
                      >
                        <ShieldCheck size={11} aria-hidden="true" />
                        Make admin
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'grant'
              ? `Grant platform admin to ${pending.user.email}?`
              : `Revoke platform admin from ${pending.user.email}?`
          }
          body={
            pending.kind === 'grant' ? (
              <div className="space-y-2">
                <p>
                  They&rsquo;ll get access to every team, the audit log,
                  billing, and the ability to grant or revoke other
                  admins. Reserve this for trusted operators.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p>
                  They&rsquo;ll lose access to the platform admin
                  surfaces. Their team-side roles are unaffected.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  The last remaining admin can&rsquo;t be revoked — promote
                  a teammate first if this would empty the role.
                </p>
              </div>
            )
          }
          confirmLabel={
            actionBusy
              ? pending.kind === 'grant'
                ? 'Granting…'
                : 'Revoking…'
              : pending.kind === 'grant'
                ? 'Grant admin'
                : 'Revoke admin'
          }
          cancelLabel="Cancel"
          tone={pending.kind === 'grant' ? 'primary' : 'danger'}
          onConfirm={() => {
            if (actionBusy) return
            void onConfirmAction()
          }}
          onCancel={() => {
            if (actionBusy) return
            setPending(null)
          }}
        />
      )}
    </div>
  )
}

function compareRows(a: AdminUserRow, b: AdminUserRow, key: SortKey): number {
  switch (key) {
    case 'email':
      return a.email.localeCompare(b.email)
    case 'name':
      return (a.name ?? '').localeCompare(b.name ?? '')
    case 'team_count':
      return a.team_count - b.team_count
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
