import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, CreditCard, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react'
import {
  adminGetTeamDetail,
  adminSetTeamSuspended,
  type AdminTeamDetail,
} from '../../lib/adminSuspend'
import {
  teamGetSubscription,
  type TeamSubscription,
} from '../../lib/billing'
import {
  adminTeamUsage,
  adminDeleteTeam,
  adminListPlatformAudit,
  adminListTeamOffices,
  type AdminTeamOffice,
  type PlatformAuditRow,
  type TeamUsage,
} from '../../lib/adminLaunch'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ConfirmDialog } from '../editor/ConfirmDialog'

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
  const [sub, setSub] = useState<TeamSubscription | null>(null)
  const [usage, setUsage] = useState<TeamUsage | null>(null)
  const [recent, setRecent] = useState<PlatformAuditRow[] | null>(null)
  const [offices, setOffices] = useState<AdminTeamOffice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  useDocumentTitle(detail ? `${detail.name} · Admin — Floorcraft` : null)

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    async function load() {
      const [result, subResult, usageResult, recentResult, officesResult] =
        await Promise.all([
          adminGetTeamDetail(teamId!),
          // Best-effort: a project that hasn't applied the billing
          // migration returns null and we hide the card. Don't block
          // team-detail rendering on it.
          teamGetSubscription(teamId!).catch(() => null),
          // Usage RPC came in migration 0022. Same best-effort
          // pattern — projects on older migrations skip the card.
          adminTeamUsage(teamId!).catch(() => null),
          // Recent audit events for this team — same RPC the
          // platform audit page uses, just pulled with a smaller
          // limit. Best-effort like the others.
          adminListPlatformAudit({ limit: 50 }).catch(() => null),
          // Offices for this team via migration 0024's RPC. Best-
          // effort: pre-0024 projects skip the card.
          adminListTeamOffices(teamId!).catch(() => null),
        ])
      if (cancelled) return
      if (!result) {
        setError('Could not load team detail.')
        return
      }
      setDetail(result)
      setSub(subResult)
      setUsage(usageResult)
      // Filter the platform-wide list down to this team. The RPC
      // doesn't accept a team filter; pulling a slightly larger
      // window and filtering client-side keeps the API surface
      // small without a second RPC.
      setRecent(
        recentResult ? recentResult.filter((r) => r.team_id === teamId) : null,
      )
      setOffices(officesResult)
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
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  to={`/admin/audit?team=${detail.id}`}
                  className="text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
                >
                  View audit →
                </Link>
                <Link
                  to={`/t/${detail.slug}`}
                  className="text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
                >
                  Open team home →
                </Link>
              </div>
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

          {sub && <BillingCard sub={sub} />}

          {usage && <UsageCard usage={usage} />}

          {offices && (
            <OfficesCard offices={offices} teamSlug={detail.slug} />
          )}

          {recent && <RecentEventsCard rows={recent} teamId={detail.id} />}

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
                        <td className="px-3 py-2">
                          <Link
                            to={`/admin/users?q=${encodeURIComponent(m.email)}`}
                            title={`Find ${m.email} on the Users page`}
                            className="text-gray-900 dark:text-gray-100 hover:text-[color:var(--color-blueprint-strong)] dark:hover:text-[color:var(--color-blueprint)] hover:underline"
                          >
                            {m.email}
                          </Link>
                        </td>
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

          <DangerZone
            teamName={detail.name}
            onDelete={() => setPendingDelete(true)}
          />
        </>
      )}

      {pendingDelete && detail && (
        <ConfirmDialog
          title={`Delete "${detail.name}"?`}
          body={
            <div className="space-y-2">
              <p>
                This permanently deletes the team and every office,
                roster, share token, comment, and audit row attached
                to it. There is no undo.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Use Suspend instead if you only need to temporarily
                block writes — the team data stays intact and the
                operation is reversible.
              </p>
            </div>
          }
          confirmLabel={deleteBusy ? 'Deleting…' : 'Delete team'}
          cancelLabel="Cancel"
          tone="danger"
          onConfirm={async () => {
            if (deleteBusy || !detail) return
            setDeleteBusy(true)
            const r = await adminDeleteTeam(detail.id)
            setDeleteBusy(false)
            if (r.kind === 'error') {
              setError(r.message)
              setPendingDelete(false)
              return
            }
            navigate('/admin/teams', { replace: true })
          }}
          onCancel={() => {
            if (deleteBusy) return
            setPendingDelete(false)
          }}
        />
      )}
    </div>
  )
}

function UsageCard({ usage }: { usage: TeamUsage }) {
  return (
    <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
      <h2 className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
        Usage
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field
          label="Offices"
          value={
            usage.archived_office_count > 0
              ? `${usage.office_count.toLocaleString()} (${usage.archived_office_count} archived)`
              : usage.office_count.toLocaleString()
          }
        />
        <Field label="Members" value={usage.member_count.toLocaleString()} />
        <Field label="Audit events" value={usage.audit_event_count.toLocaleString()} />
        <Field
          label="Payload size"
          value={formatBytes(usage.payload_bytes)}
        />
      </div>
      {usage.last_office_update_at && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Last office update{' '}
          {new Date(usage.last_office_update_at).toLocaleString()}
          {usage.last_audit_at && (
            <>
              {' · '}last audit event{' '}
              {new Date(usage.last_audit_at).toLocaleString()}
            </>
          )}
        </p>
      )}
    </section>
  )
}

function OfficesCard({
  offices,
  teamSlug,
}: {
  offices: AdminTeamOffice[]
  teamSlug: string
}) {
  if (offices.length === 0) {
    return (
      <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Offices
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No offices on this team.
        </p>
      </section>
    )
  }
  const active = offices.filter((o) => !o.archived_at)
  const archived = offices.filter((o) => o.archived_at)
  return (
    <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Offices{' '}
          <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400 ml-1">
            {active.length} active
            {archived.length > 0 ? ` · ${archived.length} archived` : ''}
          </span>
        </h2>
      </div>
      <ul className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
        {[...active, ...archived].map((o) => (
          <li
            key={o.id}
            className="flex items-center gap-3 px-4 py-2 text-sm"
          >
            <Link
              to={`/t/${teamSlug}/o/${o.slug}/map`}
              className="flex-1 min-w-0 text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline truncate"
              title={`Open ${o.name}`}
            >
              {o.name}
            </Link>
            <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[10rem]">
              {o.slug}
            </span>
            {o.is_private && (
              <span
                title="Private"
                className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-[color:var(--color-blueprint-soft)] dark:bg-gray-800 text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]"
              >
                Private
              </span>
            )}
            {o.archived_at && (
              <span
                title={`Archived ${new Date(o.archived_at).toLocaleDateString()}`}
                className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
              >
                Archived
              </span>
            )}
            <span
              className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0"
              title={new Date(o.updated_at).toUTCString()}
            >
              {new Date(o.updated_at).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecentEventsCard({
  rows,
  teamId,
}: {
  rows: PlatformAuditRow[]
  teamId: string
}) {
  const top = rows.slice(0, 8)
  return (
    <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Recent activity
        </h2>
        <Link
          to={`/admin/audit?team=${teamId}`}
          className="text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
        >
          View all →
        </Link>
      </div>
      {top.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
          No recent events for this team.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
          {top.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 px-4 py-2 text-xs"
            >
              <span
                className="text-gray-400 dark:text-gray-500 tabular-nums w-32 shrink-0"
                title={new Date(r.created_at).toUTCString()}
              >
                {new Date(r.created_at).toLocaleString()}
              </span>
              <span className="font-mono text-gray-700 dark:text-gray-200 w-44 truncate shrink-0">
                {r.action}
              </span>
              <span className="flex-1 truncate text-gray-600 dark:text-gray-300">
                {r.actor_email ?? r.actor_id ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DangerZone({
  teamName,
  onDelete,
}: {
  teamName: string
  onDelete: () => void
}) {
  return (
    <section className="mt-6 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-4">
      <h2 className="text-sm font-semibold mb-1 text-red-700 dark:text-red-300 flex items-center gap-2">
        <AlertTriangle size={14} aria-hidden="true" />
        Danger zone
      </h2>
      <p className="text-xs text-red-700 dark:text-red-300/90 mb-3">
        Force-delete <strong>{teamName}</strong>. Cascades through every
        office, roster, share token, comment, and audit row. There is
        no undo. Suspend the team first if there&rsquo;s any chance you
        want it back.
      </p>
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700"
      >
        Delete team…
      </button>
    </section>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
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

/**
 * Billing snapshot card. Read-only summary of the team's
 * subscription state — admin actions (overrides, Stripe Dashboard
 * deep-link) live on /admin/billing. We surface the plan + status
 * here so an operator triaging a team doesn't have to hop between
 * pages to know "are they paying?".
 */
function BillingCard({ sub }: { sub: TeamSubscription }) {
  const renews = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString()
    : null
  return (
    <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <CreditCard size={14} aria-hidden="true" />
          Billing
        </h2>
        <Link
          to="/admin/billing"
          className="text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
        >
          Manage on Billing →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Plan" value={humanPlan(sub.plan)} />
        <Field
          label="Status"
          value={<BillingStatusPill status={sub.status} />}
        />
        <Field label="Seats" value={sub.seats > 0 ? sub.seats.toLocaleString() : '—'} />
        <Field
          label={sub.status === 'canceled' ? 'Ends' : 'Renews'}
          value={renews ?? '—'}
        />
      </div>
      {sub.has_override && (
        <div className="mt-3 inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          <Sparkles size={10} aria-hidden="true" />
          Comp override active
          {sub.override_until && (
            <span className="opacity-80">
              {' '}
              until {new Date(sub.override_until).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div>
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  )
}

function BillingStatusPill({ status }: { status: TeamSubscription['status'] }) {
  const m: Record<string, { label: string; cls: string }> = {
    active: {
      label: 'Active',
      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    trialing: {
      label: 'Trial',
      cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    },
    past_due: {
      label: 'Past due',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    },
    unpaid: {
      label: 'Unpaid',
      cls: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
    },
    incomplete: {
      label: 'Incomplete',
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    },
    canceled: {
      label: 'Canceled',
      cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    },
    inactive: {
      label: 'No subscription',
      cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    },
  }
  const v = m[status] ?? m.inactive
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${v.cls}`}
    >
      {v.label}
    </span>
  )
}

function humanPlan(plan: string): string {
  if (plan === 'free') return 'Free'
  if (plan === 'comp') return 'Complimentary'
  if (plan.startsWith('price_')) return 'Paid'
  return plan
}
