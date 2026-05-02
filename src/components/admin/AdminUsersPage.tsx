import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react'
import Papa from 'papaparse'
import { adminListUsers, type AdminUserRow } from '../../lib/adminLists'
import { grantPlatformAdmin, revokePlatformAdmin } from '../../lib/platformAdmin'
import { adminSetUserSuspension } from '../../lib/adminLaunch'
import { useSession } from '../../lib/auth/AuthProvider'
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

type SortKey =
  | 'email'
  | 'name'
  | 'team_count'
  | 'created_at'
  | 'last_sign_in_at'
type SortDir = 'asc' | 'desc'

export function AdminUsersPage() {
  useDocumentTitle('Users · Admin — Floorcraft')
  // Honour `?q=…` on initial mount so cross-page links (e.g. a
  // member email click on AdminTeamDetailPage) can deep-link
  // straight into the user list with a pre-filled filter. We only
  // read this once: subsequent typing in the search input owns the
  // query state without writing back to the URL.
  const [searchParams] = useSearchParams()
  const session = useSession()
  const currentUserId =
    session.status === 'authenticated' ? session.user.id : null
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [adminsOnly, setAdminsOnly] = useState(false)
  // Status filter: All / Active / Suspended. Empty = All. Migration
  // 0030 surfaces `suspended_at` on every row; pre-0030 RPC omits
  // the field, so the filter dropdown hides itself when no row in
  // the list has the field defined.
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
  // Activity filter: All / Active in last 30d / Dormant 30d+ / Never
  // signed in. Migration 0031 adds last_sign_in_at; pre-0031 RPC
  // omits the field, so the dropdown hides itself.
  const [activityFilter, setActivityFilter] = useState<
    'all' | 'recent' | 'dormant' | 'never'
  >('all')
  // Captured "now" for relative-time math. React 19's purity rule
  // disallows Date.now() directly in render — the functional state
  // initializer runs lazily (before the first render's purity check
  // applies) and is the codebase's idiomatic pattern for this (see
  // AuditLogPage). Re-stamped on Refresh so dormant counts stay
  // current across long sessions.
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
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

  // Bulk-select state. Stored as a Set of user ids so toggle-by-id
  // is O(1) and "select all visible" is a single new Set. We don't
  // persist selection across filter changes — narrowing the search
  // and then clicking "select all" is a focused-bulk pattern (the
  // operator wants to act on the *visible* rows), so the
  // selection always lives within the current visibleUsers slice.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<
    'grant' | 'revoke' | 'suspend' | 'unsuspend' | null
  >(null)
  // Single reason applied to every user in a bulk-suspend run.
  // Captured in the confirm dialog and reset after the run.
  const [bulkSuspendReason, setBulkSuspendReason] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResults, setBulkResults] = useState<
    | Array<{ email: string; status: 'ok' | 'skipped' | 'error'; message?: string }>
    | null
  >(null)

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
    if (statusFilter === 'suspended') {
      rows = rows.filter((u) => !!u.suspended_at)
    } else if (statusFilter === 'active') {
      rows = rows.filter((u) => !u.suspended_at)
    }
    if (activityFilter !== 'all') {
      const dormantCutoff = nowMs - 30 * 24 * 60 * 60 * 1000
      rows = rows.filter((u) => {
        const last = u.last_sign_in_at
          ? new Date(u.last_sign_in_at).getTime()
          : null
        if (activityFilter === 'never') return last === null
        if (activityFilter === 'recent') return last !== null && last >= dormantCutoff
        // 'dormant' — signed in at some point but not in the last 30 days
        return last !== null && last < dormantCutoff
      })
    }
    rows.sort((a, b) => {
      const cmp = compareRows(a, b, sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [users, query, adminsOnly, statusFilter, activityFilter, nowMs, sortKey, sortDir])

  // Whether ANY row exposes a `suspended_at` field — drives whether
  // the status filter renders. On a pre-0030 project the RPC omits
  // the field on every row, so we hide the filter rather than show
  // a useless control.
  const hasSuspensionData = useMemo(
    () => !!users && users.some((u) => 'suspended_at' in u),
    [users],
  )
  const suspendedCount = useMemo(
    () => (users ? users.filter((u) => !!u.suspended_at).length : 0),
    [users],
  )
  // Same pattern for last_sign_in_at — present iff the project is on
  // migration 0031+, otherwise hide the activity filter and the
  // Last seen column entirely.
  const hasActivityData = useMemo(
    () => !!users && users.some((u) => 'last_sign_in_at' in u),
    [users],
  )
  const dormantCount = useMemo(() => {
    if (!users) return 0
    const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000
    return users.filter((u) => {
      const t = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : null
      return t !== null && t < cutoff
    }).length
  }, [users, nowMs])
  const neverSignedInCount = useMemo(
    () =>
      users
        ? users.filter((u) => 'last_sign_in_at' in u && !u.last_sign_in_at).length
        : 0,
    [users],
  )

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'email' || key === 'name' ? 'asc' : 'desc')
    }
  }

  async function runBulk() {
    if (!bulkAction || bulkBusy || !visibleUsers) return
    const targets = visibleUsers.filter((u) => selectedIds.has(u.id))
    if (targets.length === 0) return
    setBulkBusy(true)
    setBulkResults(null)
    const results: Array<{
      email: string
      status: 'ok' | 'skipped' | 'error'
      message?: string
    }> = []
    const reason = bulkSuspendReason.trim() || null
    for (const u of targets) {
      try {
        if (bulkAction === 'grant') {
          if (u.is_platform_admin) {
            results.push({ email: u.email, status: 'skipped', message: 'already admin' })
            continue
          }
          const r = await grantPlatformAdmin(u.id)
          if (r.kind === 'error') {
            results.push({ email: u.email, status: 'error', message: r.message })
          } else {
            results.push({ email: u.email, status: 'ok' })
          }
        } else if (bulkAction === 'revoke') {
          if (!u.is_platform_admin) {
            results.push({ email: u.email, status: 'skipped', message: 'not an admin' })
            continue
          }
          const r = await revokePlatformAdmin(u.id)
          if (r.kind === 'error') {
            results.push({ email: u.email, status: 'error', message: r.message })
          } else {
            results.push({ email: u.email, status: 'ok' })
          }
        } else if (bulkAction === 'suspend') {
          // Self-protection: never suspend the operator. The Edge
          // Function rejects this server-side too, but skipping here
          // keeps the result row useful + avoids the error path.
          if (u.id === currentUserId) {
            results.push({ email: u.email, status: 'skipped', message: 'cannot suspend yourself' })
            continue
          }
          if (u.suspended_at) {
            results.push({ email: u.email, status: 'skipped', message: 'already suspended' })
            continue
          }
          const r = await adminSetUserSuspension(u.id, true, reason)
          if (r.kind === 'error') {
            results.push({ email: u.email, status: 'error', message: r.message })
          } else {
            results.push({ email: u.email, status: 'ok' })
          }
        } else {
          // unsuspend
          if (!u.suspended_at) {
            results.push({ email: u.email, status: 'skipped', message: 'not suspended' })
            continue
          }
          const r = await adminSetUserSuspension(u.id, false, null)
          if (r.kind === 'error') {
            results.push({ email: u.email, status: 'error', message: r.message })
          } else {
            results.push({ email: u.email, status: 'ok' })
          }
        }
      } catch (err) {
        results.push({
          email: u.email,
          status: 'error',
          message: err instanceof Error ? err.message : 'unknown error',
        })
      }
    }
    setBulkResults(results)
    setBulkBusy(false)
    setBulkAction(null)
    setBulkSuspendReason('')
    if (results.some((r) => r.status === 'ok')) {
      setSelectedIds(new Set())
      setRefreshNonce((n) => n + 1)
      setNowMs(Date.now())
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
        suspended_at: u.suspended_at ?? '',
        last_sign_in_at: u.last_sign_in_at ?? '',
      })),
      {
        columns: [
          'id',
          'email',
          'name',
          'is_platform_admin',
          'teams',
          'created_at',
          'suspended_at',
          'last_sign_in_at',
        ],
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
        {hasSuspensionData && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as 'all' | 'active' | 'suspended',
                )
              }
              className="rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="suspended">
                Suspended ({suspendedCount})
              </option>
            </select>
          </label>
        )}
        {hasActivityData && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <span>Activity</span>
            <select
              value={activityFilter}
              onChange={(e) =>
                setActivityFilter(
                  e.target.value as 'all' | 'recent' | 'dormant' | 'never',
                )
              }
              className="rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
            >
              <option value="all">All</option>
              <option value="recent">Active &lt; 30d</option>
              <option value="dormant">Dormant 30d+ ({dormantCount})</option>
              <option value="never">Never signed in ({neverSignedInCount})</option>
            </select>
          </label>
        )}
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
          {query.trim() ||
          adminsOnly ||
          statusFilter !== 'all' ||
          activityFilter !== 'all'
            ? 'No users match the current filter.'
            : 'No users yet.'}
        </p>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-[color:var(--color-blueprint)]/40 bg-[color:var(--color-blueprint-soft)] dark:bg-gray-800/60 px-3 py-2 text-sm">
              <span className="font-mono text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => setBulkAction('grant')}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800 disabled:opacity-50"
              >
                <ShieldCheck size={11} aria-hidden="true" />
                Grant admin
              </button>
              <button
                type="button"
                onClick={() => setBulkAction('revoke')}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                <ShieldOff size={11} aria-hidden="true" />
                Revoke
              </button>
              {hasSuspensionData && (
                <>
                  <span className="text-gray-300 dark:text-gray-700">|</span>
                  <button
                    type="button"
                    onClick={() => setBulkAction('suspend')}
                    disabled={bulkBusy}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                  >
                    <ShieldAlert size={11} aria-hidden="true" />
                    Suspend
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkAction('unsuspend')}
                    disabled={bulkBusy}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                  >
                    <ShieldCheck size={11} aria-hidden="true" />
                    Unsuspend
                  </button>
                </>
              )}
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Clear selection
              </button>
            </div>
          )}
          {bulkResults && bulkResults.length > 0 && (
            <ul className="mb-2 max-h-40 overflow-y-auto divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800 rounded border border-[color:var(--color-paper-line)] dark:border-gray-800">
              {bulkResults.map((r) => (
                <li
                  key={r.email}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
                >
                  <span className="font-mono truncate">{r.email}</span>
                  <span
                    className={
                      r.status === 'ok'
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : r.status === 'skipped'
                          ? 'text-gray-500 dark:text-gray-400'
                          : 'text-red-600 dark:text-red-400'
                    }
                    title={r.message}
                  >
                    {r.status === 'ok' && '✓ Done'}
                    {r.status === 'skipped' && (r.message ?? 'Skipped')}
                    {r.status === 'error' && '✗ Error'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all visible users"
                    checked={
                      visibleUsers.length > 0 &&
                      visibleUsers.every((u) => selectedIds.has(u.id))
                    }
                    onChange={(e) => {
                      const next = new Set(selectedIds)
                      if (e.target.checked) {
                        for (const u of visibleUsers) next.add(u.id)
                      } else {
                        for (const u of visibleUsers) next.delete(u.id)
                      }
                      setSelectedIds(next)
                    }}
                    className="accent-[color:var(--color-blueprint)]"
                  />
                </th>
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
                {hasActivityData && (
                  <SortHeader
                    k="last_sign_in_at"
                    label="Last seen"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClick={onHeaderClick}
                  />
                )}
                <th className="px-3 py-2 text-right" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
              {visibleUsers.map((u) => (
                <tr key={u.id} className="hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800/30">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${u.email}`}
                      checked={selectedIds.has(u.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds)
                        if (e.target.checked) next.add(u.id)
                        else next.delete(u.id)
                        setSelectedIds(next)
                      }}
                      className="accent-[color:var(--color-blueprint)]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Link
                        to={`/admin/users/${u.id}`}
                        className="text-gray-900 dark:text-gray-100 hover:text-[color:var(--color-blueprint-strong)] dark:hover:text-[color:var(--color-blueprint)] hover:underline"
                      >
                        {u.email}
                      </Link>
                      {u.is_platform_admin && (
                        <span
                          title="Platform admin"
                          className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] px-1 py-0.5 rounded bg-[color:var(--color-blueprint-soft)] dark:bg-gray-800"
                        >
                          <ShieldCheck size={9} aria-hidden="true" />
                          Admin
                        </span>
                      )}
                      {u.suspended_at && (
                        <span
                          title={`Suspended ${new Date(u.suspended_at).toLocaleString()}`}
                          className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300 px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/40"
                        >
                          <ShieldAlert size={9} aria-hidden="true" />
                          Suspended
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
                  {hasActivityData && (
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      <LastSeenCell value={u.last_sign_in_at ?? null} nowMs={nowMs} />
                    </td>
                  )}
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
        </>
      )}

      {bulkAction && (
        <ConfirmDialog
          title={bulkConfirmTitle(bulkAction, selectedIds.size)}
          body={bulkConfirmBody(bulkAction, bulkSuspendReason, setBulkSuspendReason, bulkBusy)}
          confirmLabel={bulkConfirmLabel(bulkAction, bulkBusy)}
          cancelLabel="Cancel"
          tone={
            bulkAction === 'grant' || bulkAction === 'unsuspend'
              ? 'primary'
              : 'danger'
          }
          onConfirm={() => {
            if (bulkBusy) return
            void runBulk()
          }}
          onCancel={() => {
            if (bulkBusy) return
            setBulkAction(null)
            setBulkSuspendReason('')
          }}
        />
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
    case 'last_sign_in_at': {
      // Never-signed-in (null/undefined) sorts oldest. Comparing the
      // ISO strings directly is fine — they're all UTC.
      const av = a.last_sign_in_at ?? ''
      const bv = b.last_sign_in_at ?? ''
      return av.localeCompare(bv)
    }
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

/**
 * Renders `last_sign_in_at` as a relative time ("3d ago", "5mo ago"),
 * with the absolute timestamp on hover. Null = never signed in,
 * shown as a muted dash with an explanatory tooltip.
 */
function LastSeenCell({
  value,
  nowMs,
}: {
  value: string | null
  nowMs: number
}) {
  if (!value) {
    return (
      <span
        className="text-gray-400 dark:text-gray-500"
        title="This user has never signed in (likely a pending invitee)."
      >
        never
      </span>
    )
  }
  const ts = new Date(value)
  const ms = nowMs - ts.getTime()
  const dormant = ms > 30 * 24 * 60 * 60 * 1000
  return (
    <span
      title={ts.toLocaleString()}
      className={dormant ? 'text-amber-700 dark:text-amber-400' : ''}
    >
      {formatRelative(ms)}
    </span>
  )
}

function formatRelative(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  const yr = Math.floor(day / 365)
  return `${yr}y ago`
}

type BulkAction = 'grant' | 'revoke' | 'suspend' | 'unsuspend'

function bulkConfirmTitle(action: BulkAction, count: number): string {
  const noun = `${count} user${count === 1 ? '' : 's'}`
  switch (action) {
    case 'grant':
      return `Grant platform admin to ${noun}?`
    case 'revoke':
      return `Revoke platform admin from ${noun}?`
    case 'suspend':
      return `Suspend ${noun}?`
    case 'unsuspend':
      return `Unsuspend ${noun}?`
  }
}

function bulkConfirmLabel(action: BulkAction, busy: boolean): string {
  if (busy) {
    switch (action) {
      case 'grant':
        return 'Granting…'
      case 'revoke':
        return 'Revoking…'
      case 'suspend':
        return 'Suspending…'
      case 'unsuspend':
        return 'Unsuspending…'
    }
  }
  switch (action) {
    case 'grant':
      return 'Grant admin'
    case 'revoke':
      return 'Revoke admin'
    case 'suspend':
      return 'Suspend users'
    case 'unsuspend':
      return 'Unsuspend users'
  }
}

function bulkConfirmBody(
  action: BulkAction,
  reason: string,
  setReason: (v: string) => void,
  busy: boolean,
): React.ReactNode {
  if (action === 'grant') {
    return (
      <div className="space-y-2">
        <p>
          Each selected user will get full platform-admin access.
          Already-admin rows are skipped.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Errors on individual rows surface inline; the rest of the
          batch still runs.
        </p>
      </div>
    )
  }
  if (action === 'revoke') {
    return (
      <div className="space-y-2">
        <p>
          Each selected user will lose platform-admin access. Non-admin
          rows are skipped.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The last remaining admin can&rsquo;t be revoked — that row
          will surface as an error and the rest of the batch continues.
        </p>
      </div>
    )
  }
  if (action === 'suspend') {
    return (
      <div className="space-y-3">
        <p>
          Each selected user will be signed out of every active session
          and blocked from signing in. Already-suspended rows are
          skipped, and you can&rsquo;t suspend yourself.
        </p>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
            Reason (applied to every user, optional)
          </span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            maxLength={500}
            placeholder="e.g. policy violation — case #4421"
            className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)] disabled:opacity-50"
          />
        </label>
      </div>
    )
  }
  return (
    <p>
      Each selected user will be able to sign in again immediately.
      Their team memberships and roles were preserved. Non-suspended
      rows are skipped.
    </p>
  )
}
