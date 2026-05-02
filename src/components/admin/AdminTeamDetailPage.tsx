import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import {
  adminGetTeamDetail,
  adminSetTeamSuspended,
  type AdminTeamDetail,
} from '../../lib/adminSuspend'

/**
 * Per-team detail surface for platform admins. Shows membership +
 * office count + suspension state. Suspend / unsuspend toggle goes
 * through the SECURITY DEFINER `admin_set_team_suspended` RPC; the
 * server enforces the actual write block on offices via a trigger
 * (migration 0019), so flipping this is the load-bearing action.
 *
 * Read-only on members for now — adding/removing members happens
 * inside the team's own settings, not the platform-admin surface.
 */
export function AdminTeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<AdminTeamDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    async function load() {
      const result = await adminGetTeamDetail(teamId!)
      if (cancelled) return
      if (!result) {
        setError('Could not load team detail.')
        return
      }
      setDetail(result)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [teamId, refreshNonce])

  if (!teamId) return null
  return (
    <div className="p-8 max-w-4xl">
      <Link
        to="/admin/teams"
        className="inline-flex items-center gap-1 text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline mb-3"
      >
        <ArrowLeft size={12} aria-hidden="true" />
        All teams
      </Link>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/40 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {detail === null && !error && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      )}

      {detail && (
        <>
          <header className="mb-6">
            <div className="flex items-baseline justify-between gap-4 mb-1">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-baseline gap-2">
                {detail.name}
                {detail.is_suspended && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">
                    <ShieldAlert size={11} aria-hidden="true" />
                    Suspended
                  </span>
                )}
              </h1>
              <Link
                to={`/t/${detail.slug}`}
                className="text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
              >
                Open team home →
              </Link>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-mono">{detail.slug}</span> ·{' '}
              {detail.members.length} member{detail.members.length === 1 ? '' : 's'} ·{' '}
              {detail.office_count} office{detail.office_count === 1 ? '' : 's'} ·{' '}
              created {new Date(detail.created_at).toLocaleDateString()}
            </p>
          </header>

          <SuspendCard
            detail={detail}
            onChanged={() => setRefreshNonce((n) => n + 1)}
            onError={(msg) => setError(msg)}
          />

          <section className="mt-6">
            <h2 className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
              Members
            </h2>
            {detail.members.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No members.</p>
            ) : (
              <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50">
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
                    {detail.members.map((m) => (
                      <tr key={m.user_id}>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{m.email}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                          {m.name?.trim() || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              m.role === 'admin'
                                ? 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]'
                                : 'bg-[color:var(--color-paper-sunken)] dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {m.role}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                          {new Date(m.joined_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {/* `navigate` referenced so future "Delete team" hard-action lands here */}
      {void navigate}
    </div>
  )
}

function SuspendCard({
  detail,
  onChanged,
  onError,
}: {
  detail: AdminTeamDetail
  onChanged: () => void
  onError: (msg: string) => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmingUnsuspend, setConfirmingUnsuspend] = useState(false)

  async function onSuspend(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const result = await adminSetTeamSuspended({
      teamId: detail.id,
      suspended: true,
      reason: reason.trim() || undefined,
    })
    setBusy(false)
    if (result.kind === 'error') {
      onError(result.message)
      return
    }
    setReason('')
    onChanged()
  }

  async function onUnsuspend() {
    setBusy(true)
    const result = await adminSetTeamSuspended({
      teamId: detail.id,
      suspended: false,
    })
    setBusy(false)
    setConfirmingUnsuspend(false)
    if (result.kind === 'error') {
      onError(result.message)
      return
    }
    onChanged()
  }

  if (detail.is_suspended) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
          <ShieldAlert size={14} aria-hidden="true" />
          Team is suspended
        </div>
        <p className="text-xs text-red-700 dark:text-red-300/90">
          {detail.suspension_reason ? (
            <>
              <strong>Reason:</strong> {detail.suspension_reason}
            </>
          ) : (
            <em>No reason recorded.</em>
          )}
          {detail.suspended_at && (
            <>
              {' · '}
              {new Date(detail.suspended_at).toLocaleString()}
            </>
          )}
          {detail.suspended_by_email && (
            <>
              {' · '}by {detail.suspended_by_email}
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-red-700 dark:text-red-300/90">
          Members can sign in and read but cannot edit. Server-side trigger blocks every office
          write until you unsuspend.
        </p>
        {confirmingUnsuspend ? (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onUnsuspend}
              disabled={busy}
              className="px-3 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? 'Unsuspending…' : 'Yes, unsuspend'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingUnsuspend(false)}
              className="px-3 py-1 text-xs text-gray-600 dark:text-gray-300 hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingUnsuspend(true)}
            className="mt-3 inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded border border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <ShieldCheck size={11} aria-hidden="true" />
            Unsuspend team
          </button>
        )}
      </div>
    )
  }

  return (
    <form
      onSubmit={onSuspend}
      className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4"
    >
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <AlertTriangle size={14} aria-hidden="true" />
        Suspend this team
      </h2>
      <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
        Members keep read access; all writes are blocked until you unsuspend. Reversible.
      </p>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
        Reason (optional, surfaced in the team&rsquo;s banner)
      </label>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Payment overdue, support ticket #123"
        disabled={busy}
        className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm px-2.5 py-1.5 mb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
      />
      <button
        type="submit"
        disabled={busy}
        className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? 'Suspending…' : 'Suspend team'}
      </button>
    </form>
  )
}
