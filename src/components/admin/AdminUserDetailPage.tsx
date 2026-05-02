import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  User as UserIcon,
  X as XIcon,
} from 'lucide-react'
import {
  adminGetUserDetail,
  adminGeneratePasswordResetLink,
  adminSetUserSuspension,
  type AdminUserDetail,
} from '../../lib/adminLaunch'
import {
  grantPlatformAdmin,
  revokePlatformAdmin,
} from '../../lib/platformAdmin'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useSession } from '../../lib/auth/AuthProvider'
import { ConfirmDialog } from '../editor/ConfirmDialog'
import { UserAuditCard } from './UserAuditCard'

/**
 * Per-user detail surface for platform admins. Shows the user's
 * profile fields and the list of teams they're a member of.
 * Mirrors AdminTeamDetailPage's shape — header, identity strip,
 * action card (grant / revoke admin), member-list table.
 *
 * Read-only on team membership for now: removing a user from a
 * team happens inside the team's own settings, not the platform-
 * admin surface. Adding the same dance here would risk doing it
 * by accident.
 */
export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const session = useSession()
  const currentUserId =
    session.status === 'authenticated' ? session.user.id : null
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [pending, setPending] = useState<'grant' | 'revoke' | null>(null)
  const [busy, setBusy] = useState(false)
  // Suspension card state. The reason input is shown when the
  // operator is about to suspend; on the unsuspend path we skip
  // straight to the confirm dialog.
  const [suspendReason, setSuspendReason] = useState('')
  const [pendingSuspend, setPendingSuspend] = useState<
    'suspend' | 'unsuspend' | null
  >(null)
  const [suspendBusy, setSuspendBusy] = useState(false)
  // Password-reset link state. We surface the generated link in a
  // small modal with a Copy button so the admin can hand it to the
  // user out-of-band. `pendingLink` is null while idle, 'pending'
  // while the Edge Function is running, or holds the link.
  const [resetState, setResetState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'ok'; link: string; copied: boolean }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })
  useDocumentTitle(detail ? `${detail.email} · Admin — Floorcraft` : null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function load() {
      const result = await adminGetUserDetail(userId!)
      if (cancelled) return
      if (!result) {
        setError(
          'Could not load user detail. Migration 0025 may not be applied yet.',
        )
        return
      }
      setError(null)
      setDetail(result)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [userId, refreshNonce])

  async function onGenerateResetLink() {
    if (!detail) return
    setResetState({ kind: 'busy' })
    const r = await adminGeneratePasswordResetLink(detail.id)
    if (r.kind === 'error') {
      setResetState({ kind: 'error', message: r.message })
      return
    }
    setResetState({ kind: 'ok', link: r.actionLink, copied: false })
  }

  async function onCopyResetLink() {
    if (resetState.kind !== 'ok') return
    try {
      await navigator.clipboard.writeText(resetState.link)
      setResetState({ ...resetState, copied: true })
    } catch {
      // Best-effort. The link is also visible in the modal so the
      // operator can copy by selection if clipboard is denied.
    }
  }

  async function onConfirm() {
    if (!detail || !pending || busy) return
    setBusy(true)
    const r =
      pending === 'grant'
        ? await grantPlatformAdmin(detail.id)
        : await revokePlatformAdmin(detail.id)
    setBusy(false)
    setPending(null)
    if (r.kind === 'error') {
      setError(r.message)
      return
    }
    setError(null)
    setRefreshNonce((n) => n + 1)
  }

  async function onConfirmSuspend() {
    if (!detail || !pendingSuspend || suspendBusy) return
    const suspending = pendingSuspend === 'suspend'
    setSuspendBusy(true)
    const r = await adminSetUserSuspension(
      detail.id,
      suspending,
      suspending ? suspendReason.trim() || null : null,
    )
    setSuspendBusy(false)
    setPendingSuspend(null)
    if (r.kind === 'error') {
      setError(r.message)
      return
    }
    setError(null)
    setSuspendReason('')
    setRefreshNonce((n) => n + 1)
  }

  if (!userId) return null

  return (
    <div className="p-8 max-w-4xl">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1 text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline mb-3"
      >
        <ArrowLeft size={12} aria-hidden="true" />
        All users
      </Link>

      {error && (
        <div className="mb-4 rounded border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      {detail === null && !error && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      )}

      {detail && (
        <>
          <header className="mb-6">
            <div className="flex items-baseline justify-between gap-4 mb-1 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-baseline gap-2 min-w-0">
                <span className="truncate">{detail.email}</span>
                {detail.is_platform_admin && (
                  <span
                    title="Platform admin"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[color:var(--color-blueprint-soft)] dark:bg-gray-800 text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]"
                  >
                    <ShieldCheck size={11} aria-hidden="true" />
                    Admin
                  </span>
                )}
                {detail.suspended_at && (
                  <span
                    title={
                      detail.suspended_reason
                        ? `Suspended: ${detail.suspended_reason}`
                        : 'Suspended'
                    }
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                  >
                    <ShieldAlert size={11} aria-hidden="true" />
                    Suspended
                  </span>
                )}
              </h1>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {detail.name?.trim() ? (
                <>
                  <span>{detail.name}</span> ·{' '}
                </>
              ) : null}
              <span>
                {detail.teams.length} team
                {detail.teams.length === 1 ? '' : 's'}
              </span>{' '}
              · signed up {new Date(detail.created_at).toLocaleDateString()}
            </p>
          </header>

          {/*
           * Suspension card. Pre-0028 projects don't have the
           * `suspended_at` field on AdminUserDetail (the RPC's
           * jsonb response just omits it), so we render the card
           * unconditionally — the absence of the field is treated
           * as "not suspended" and the operator can suspend.
           * If the Edge Function isn't deployed the call fails
           * with a network error and we surface it.
           */}
          <section
            className={`mb-6 rounded-lg border p-4 ${
              detail.suspended_at
                ? 'border-red-300 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20'
                : 'border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900'
            }`}
          >
            <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
              {detail.suspended_at ? (
                <ShieldAlert size={14} aria-hidden="true" />
              ) : (
                <ShieldOff size={14} aria-hidden="true" />
              )}
              Suspension
            </h2>
            {detail.suspended_at ? (
              <>
                <p className="text-xs text-red-800 dark:text-red-200 mb-2">
                  This user is suspended — they can&rsquo;t sign in or
                  refresh their session. Suspended{' '}
                  {new Date(detail.suspended_at).toLocaleString()}
                  {detail.suspended_reason ? (
                    <>
                      {' '}
                      · reason:{' '}
                      <span className="italic">
                        {detail.suspended_reason}
                      </span>
                    </>
                  ) : null}
                  .
                </p>
                <button
                  type="button"
                  onClick={() => setPendingSuspend('unsuspend')}
                  disabled={suspendBusy}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded border border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                >
                  <ShieldCheck size={12} aria-hidden="true" />
                  Unsuspend user
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                  Suspending blocks sign-in and refreshes the user
                  out of every active session. Their data is
                  preserved; team-side roles are unaffected. Reason
                  is optional but shows up in the audit log + on
                  this page.
                </p>
                <label className="block mb-2">
                  <span className="block text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                    Reason (optional)
                  </span>
                  <input
                    type="text"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    placeholder="e.g. abuse report — case #4421"
                    maxLength={500}
                    disabled={
                      suspendBusy || detail.id === currentUserId
                    }
                    className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-sm px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)] disabled:opacity-50"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setPendingSuspend('suspend')}
                  disabled={suspendBusy || detail.id === currentUserId}
                  title={
                    detail.id === currentUserId
                      ? 'You cannot suspend yourself.'
                      : undefined
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded border border-red-600 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ShieldAlert size={12} aria-hidden="true" />
                  Suspend user
                </button>
                {detail.id === currentUserId && (
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                    You can&rsquo;t suspend yourself.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
            <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <UserIcon size={14} aria-hidden="true" />
              Platform admin
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
              {detail.is_platform_admin
                ? 'This user has full platform-admin access. Revoking removes their access to /admin and team-side bypass; their team-side roles are unaffected.'
                : 'This user is a regular member. Granting admin gives them full access to every team, audit log, billing, and the ability to grant or revoke other admins.'}
            </p>
            {detail.is_platform_admin ? (
              <button
                type="button"
                onClick={() => setPending('revoke')}
                disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded border border-red-600 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                <ShieldOff size={12} aria-hidden="true" />
                Revoke admin
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPending('grant')}
                disabled={busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded bg-[color:var(--color-blueprint-strong)] text-white hover:bg-[color:var(--color-blueprint)] disabled:opacity-50"
              >
                <ShieldCheck size={12} aria-hidden="true" />
                Grant admin
              </button>
            )}
          </section>

          <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
            <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
              <KeyRound size={14} aria-hidden="true" />
              Password reset
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
              Generate a one-time recovery link for this user. The
              link doesn&rsquo;t auto-email — copy it and send via
              your support channel. Useful when a user can&rsquo;t
              receive the standard reset email.
            </p>
            <button
              type="button"
              onClick={() => void onGenerateResetLink()}
              disabled={resetState.kind === 'busy'}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800 disabled:opacity-50"
            >
              <KeyRound size={12} aria-hidden="true" />
              {resetState.kind === 'busy'
                ? 'Generating…'
                : 'Generate reset link'}
            </button>
            {resetState.kind === 'error' && (
              <p
                role="alert"
                className="mt-2 text-xs text-red-600 dark:text-red-400"
              >
                {resetState.message}
                {resetState.message.includes('not found') && (
                  <span className="block text-gray-500 mt-0.5">
                    The Edge Function may not be deployed yet — see
                    README for the supabase functions deploy command.
                  </span>
                )}
              </p>
            )}
          </section>

          <UserAuditCard userId={detail.id} />

          <section className="mt-6">
            <h2 className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
              Teams
            </h2>
            {detail.teams.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Not a member of any team.
              </p>
            ) : (
              <div className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50">
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <th className="px-3 py-2">Team</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
                    {detail.teams.map((t) => (
                      <tr key={t.team_id}>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            <Link
                              to={`/admin/teams/${t.team_id}`}
                              className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
                            >
                              {t.team_name}
                            </Link>
                            {t.is_suspended && (
                              <span
                                title="Suspended"
                                className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                              >
                                <ShieldAlert size={9} aria-hidden="true" />
                                Suspended
                              </span>
                            )}
                          </span>
                          <div className="font-mono text-[10px] text-gray-400 mt-0.5">
                            {t.team_slug}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              t.role === 'admin'
                                ? 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]'
                                : 'bg-[color:var(--color-paper-sunken)] dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {t.role}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                          {new Date(t.joined_at).toLocaleDateString()}
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

      {resetState.kind === 'ok' && detail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Password reset link"
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/30 dark:bg-black/60 backdrop-blur-sm"
          onClick={() => setResetState({ kind: 'idle' })}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <KeyRound size={14} aria-hidden="true" />
                Recovery link generated
              </h3>
              <button
                type="button"
                onClick={() => setResetState({ kind: 'idle' })}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <XIcon size={14} aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
              Send this link to <strong>{detail.email}</strong> via Slack,
              email, or your support channel. It&rsquo;s a one-time link
              that lets them set a new password. Treat it like a
              credential — anyone with it can take over the account.
            </p>
            <textarea
              value={resetState.link}
              readOnly
              rows={3}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-sunken)] dark:bg-gray-800 text-xs px-2 py-1.5 font-mono break-all"
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onCopyResetLink()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded bg-[color:var(--color-blueprint-strong)] text-white hover:bg-[color:var(--color-blueprint)]"
              >
                {resetState.copied ? (
                  <>
                    <Check size={12} aria-hidden="true" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy size={12} aria-hidden="true" />
                    Copy link
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setResetState({ kind: 'idle' })}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {pending && detail && (
        <ConfirmDialog
          title={
            pending === 'grant'
              ? `Grant platform admin to ${detail.email}?`
              : `Revoke platform admin from ${detail.email}?`
          }
          body={
            pending === 'grant' ? (
              <p>
                They&rsquo;ll get access to every team, the audit log,
                billing, and the ability to grant or revoke other
                admins. Reserve this for trusted operators.
              </p>
            ) : (
              <div className="space-y-2">
                <p>
                  They&rsquo;ll lose access to the platform admin
                  surfaces. Their team-side roles are unaffected.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  The last remaining admin can&rsquo;t be revoked.
                </p>
              </div>
            )
          }
          confirmLabel={
            busy
              ? pending === 'grant'
                ? 'Granting…'
                : 'Revoking…'
              : pending === 'grant'
                ? 'Grant admin'
                : 'Revoke admin'
          }
          cancelLabel="Cancel"
          tone={pending === 'grant' ? 'primary' : 'danger'}
          onConfirm={() => {
            if (busy) return
            void onConfirm()
          }}
          onCancel={() => {
            if (busy) return
            setPending(null)
          }}
        />
      )}

      {pendingSuspend && detail && (
        <ConfirmDialog
          title={
            pendingSuspend === 'suspend'
              ? `Suspend ${detail.email}?`
              : `Unsuspend ${detail.email}?`
          }
          body={
            pendingSuspend === 'suspend' ? (
              <div className="space-y-2">
                <p>
                  This signs them out of every active session and
                  blocks any future sign-in or token refresh.
                </p>
                {suspendReason.trim() ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Reason: <span className="italic">{suspendReason.trim()}</span>
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No reason provided — consider adding one for the audit log.
                  </p>
                )}
              </div>
            ) : (
              <p>
                They&rsquo;ll be able to sign in again immediately.
                Their team memberships and roles were preserved.
              </p>
            )
          }
          confirmLabel={
            suspendBusy
              ? pendingSuspend === 'suspend'
                ? 'Suspending…'
                : 'Unsuspending…'
              : pendingSuspend === 'suspend'
                ? 'Suspend user'
                : 'Unsuspend user'
          }
          cancelLabel="Cancel"
          tone={pendingSuspend === 'suspend' ? 'danger' : 'primary'}
          onConfirm={() => {
            if (suspendBusy) return
            void onConfirmSuspend()
          }}
          onCancel={() => {
            if (suspendBusy) return
            setPendingSuspend(null)
          }}
        />
      )}
    </div>
  )
}
