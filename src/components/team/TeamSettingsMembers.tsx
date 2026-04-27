import { useEffect, useMemo, useState } from 'react'
import { UserPlus, Copy, Check, MoreHorizontal, Trash2, Shield, RefreshCw, Mail } from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'
import type { Team, TeamMember, Invite } from '../../types/team'
import {
  listTeamMembers,
  listInvites,
  removeMember,
  updateMemberRole,
} from '../../lib/teams/teamRepository'
import { ConfirmDialog } from '../editor/ConfirmDialog'
import { Button } from '../ui'
import { InviteMemberModal } from './InviteMemberModal'
import { useToastStore } from '../../stores/toastStore'

/**
 * Wave 17C: the Members tab is the single highest-leverage surface in
 * the team-settings area — this is where team owners pull collaborators
 * in, and a rough-looking flow directly hurts team growth.
 *
 * Structure (top-down):
 *   1. Top bar: member + pending-invite chips on the left, primary
 *      "Invite member" button on the right. Button opens
 *      `<InviteMemberModal>` (extracted) which carries the email
 *      validation, role selector, toast-on-success, and
 *      fallback-on-email-failure UX.
 *   2. Members section: avatar + name/email + role badge + joined-date;
 *      rows expose a `...` menu for "Change role" / "Remove" gated by
 *      admin permission.
 *   3. Pending invites section (hidden entirely at zero): email + role
 *      badge + sent-ago text + status pill ("Waiting" / "Expired") +
 *      per-row actions (Copy link / Revoke).
 *
 * The legacy inline invite form + banner are preserved in spirit by
 * the modal + toast combo; the subtle fallback path where the edge
 * function fails still keeps the invite row alive and surfaces the
 * shareable link to the admin.
 */

// ------------------------------------------------------------------
// Avatar helpers — same hash-to-color idiom as TeamHomePage so members
// show up with identical initials coloring across the app.
// ------------------------------------------------------------------

const AVATAR_COLORS = ['#2563eb', '#0891b2', '#9333ea', '#db2777', '#ea580c', '#16a34a', '#ca8a04']

function hashToColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initialsFor(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim()
  if (!trimmed) return '?'
  // Prefer first-last initials when the string reads like a name; fall
  // back to the first two chars of the local-part for bare emails.
  const atIndex = trimmed.indexOf('@')
  const base = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed
  const parts = base.split(/[.\s_-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ------------------------------------------------------------------
// Time helper — "2 days ago" style strings without pulling date-fns
// into the bundle. The exact phrasing matches common US-English SaaS
// conventions; the thresholds are the standard 60/60/24/7/30 ladder.
// ------------------------------------------------------------------

function sentAgo(iso: string): string {
  const now = Date.now()
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, now - t)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  return new Date(iso).toLocaleDateString()
}

// "Stale" threshold for invites — beyond this we gray out the row and
// label it Expired regardless of the server expires_at, because most
// invite-email providers stop delivering links that old anyway.
const STALE_INVITE_MS = 7 * 24 * 60 * 60 * 1000

// ------------------------------------------------------------------
// Role badge. Renders a tinted pill; admin uses indigo, member neutral
// gray. Kept presentational (not a <button>) so it doesn't trap focus.
// ------------------------------------------------------------------

function RoleBadge({ role }: { role: TeamMember['role'] }) {
  const isAdmin = role === 'admin'
  return (
    <span
      className={
        isAdmin
          ? 'inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
          : 'inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300'
      }
    >
      {isAdmin && <Shield size={10} aria-hidden="true" />}
      {isAdmin ? 'Admin' : 'Member'}
    </span>
  )
}

function Avatar({ seed, label }: { seed: string; label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ backgroundColor: hashToColor(seed) }}
    >
      {initialsFor(label)}
    </div>
  )
}

// ------------------------------------------------------------------
// Member row — hover-highlight, avatar + name/email stack, role badge,
// and a `...` menu on the right that exposes role change + remove for
// admins on non-self rows. The menu is a small controlled popover;
// Escape and outside-click both close it.
// ------------------------------------------------------------------

function MemberRow({
  member,
  isAdmin,
  isSelf,
  onChangeRole,
  onRemove,
}: {
  member: TeamMember
  isAdmin: boolean
  isSelf: boolean
  onChangeRole: (next: TeamMember['role']) => void
  onRemove: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const label = member.name ?? member.email ?? member.user_id
  const secondary = member.name ? member.email : undefined

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (target && target.closest(`[data-member-menu="${member.user_id}"]`)) return
      setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, member.user_id])

  const canActOnRow = isAdmin && !isSelf

  return (
    <li
      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/40"
    >
      <Avatar seed={member.user_id} label={label} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}
          {isSelf && (
            <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">
              (you)
            </span>
          )}
        </div>
        {secondary && (
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
            {secondary}
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <RoleBadge role={member.role} />
        {member.joined_at && (
          <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            Joined {sentAgo(member.joined_at)}
          </span>
        )}
        {canActOnRow ? (
          <div className="relative" data-member-menu={member.user_id}>
            <button
              type="button"
              aria-label={`Actions for ${label}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-10 w-44 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900 py-1"
              >
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onChangeRole(member.role === 'admin' ? 'member' : 'admin')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Shield size={14} aria-hidden="true" />
                  {member.role === 'admin' ? 'Make member' : 'Make admin'}
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onRemove()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Remove
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </li>
  )
}

// ------------------------------------------------------------------
// Invite row — compact; expired invites render grayed with an
// "Expired" pill instead of "Waiting".
// ------------------------------------------------------------------

function InviteRow({
  invite,
  onCopy,
  onResend,
  onRevoke,
  canAct,
  nowMs,
}: {
  invite: Invite
  onCopy: (url: string, id: string) => void
  onResend: (invite: Invite) => void
  onRevoke: (invite: Invite) => void
  canAct: boolean
  /**
   * The parent owns the wall-clock reference via a useState-backed
   * interval so the row body stays pure (`Date.now()` in render
   * violates `react-hooks/purity`). A slightly stale `nowMs` is fine
   * — the expired-vs-pending threshold is a multi-day bucket.
   */
  nowMs: number
}) {
  const createdAt = new Date(invite.created_at).getTime()
  const expired =
    (Number.isFinite(createdAt) && nowMs - createdAt > STALE_INVITE_MS) ||
    (invite.expires_at && new Date(invite.expires_at).getTime() < nowMs)
  const url = `${window.location.origin}/invite/${invite.token}`
  const [copied, setCopied] = useState(false)

  function copy() {
    onCopy(url, invite.id)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <li
      className={
        expired
          ? 'flex items-center gap-3 rounded-md px-3 py-2 opacity-60'
          : 'flex items-center gap-3 rounded-md px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/40'
      }
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        <Mail size={14} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {invite.email}
        </div>
        <div className="truncate text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          Sent {sentAgo(invite.created_at)}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
        {expired ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            Expired
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Waiting
          </span>
        )}
        {canAct && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={copy}
              leftIcon={copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {!expired && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onResend(invite)}
                leftIcon={<RefreshCw size={12} aria-hidden="true" />}
              >
                Resend
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRevoke(invite)}
              leftIcon={<Trash2 size={12} aria-hidden="true" />}
              className="text-red-600 hover:text-red-700 dark:text-red-400"
            >
              Revoke
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

// ------------------------------------------------------------------
// Main component.
// ------------------------------------------------------------------

export function TeamSettingsMembers({
  team,
  isAdmin,
  selfId: selfIdProp,
}: {
  team: Team
  isAdmin: boolean
  /**
   * Optional override. When omitted (the default route-wired case) the
   * component reads the signed-in user id from `useSession()` so the
   * caller doesn't have to plumb auth state through bridge components.
   */
  selfId?: string
}) {
  const session = useSession()
  const selfId =
    selfIdProp ?? (session.status === 'authenticated' ? session.user.id : '')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  // Target of the pending remove confirmation. `null` means no dialog is
  // open. Storing the full member (not just the id) lets the dialog body
  // show the email/name without re-querying the list.
  const [pendingRemove, setPendingRemove] = useState<TeamMember | null>(null)
  const [pendingRevoke, setPendingRevoke] = useState<Invite | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  // Wall-clock reference for the "expired" check on invite rows. We
  // own it here (and tick it once a minute) so the row renderers stay
  // pure — the `react-hooks/purity` rule forbids `Date.now()` in a
  // render body. One-minute resolution is plenty for a 7-day bucket.
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const pushToast = useToastStore((s) => s.push)

  async function refresh() {
    setMembers(await listTeamMembers(team.id))
    setInvites(await listInvites(team.id))
  }
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id])

  const memberCount = members.length
  const pendingCount = useMemo(
    () =>
      invites.filter((i) => {
        const createdAt = new Date(i.created_at).getTime()
        const staleByCreated =
          Number.isFinite(createdAt) && nowMs - createdAt > STALE_INVITE_MS
        const staleByExpires =
          i.expires_at && new Date(i.expires_at).getTime() < nowMs
        return !staleByCreated && !staleByExpires
      }).length,
    [invites, nowMs],
  )

  async function copyInviteLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      pushToast({ tone: 'success', title: 'Invite link copied' })
    } catch {
      // Clipboard may reject in insecure contexts; surface a visible
      // fallback hint so the admin doesn't silently think it worked.
      pushToast({
        tone: 'warning',
        title: 'Copy failed',
        body: 'Select the URL manually if clipboard access is blocked.',
      })
    }
  }

  async function resendInvite(invite: Invite) {
    try {
      const { error: fnErr } = await supabase.functions.invoke('send-invite-email', {
        body: { token: invite.token },
      })
      if (fnErr) throw new Error(fnErr.message ?? 'Failed to resend')
      pushToast({ tone: 'success', title: `Invitation resent to ${invite.email}` })
    } catch (err) {
      pushToast({
        tone: 'warning',
        title: "Couldn't resend the email",
        body: err instanceof Error ? err.message : 'Copy the invite link and share it manually.',
      })
    }
  }

  async function confirmRevoke(invite: Invite) {
    // Revoke = delete the invite row. RLS on `invites` gates this to
    // the inviter / team admin; failure surfaces as a toast rather
    // than tearing the UI down.
    try {
      const { error } = await supabase
        .from('invites')
        .delete()
        .eq('id', invite.id)
      if (error) throw error
      pushToast({ tone: 'success', title: `Invite to ${invite.email} revoked` })
    } catch (err) {
      pushToast({
        tone: 'error',
        title: "Couldn't revoke invite",
        body: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setPendingRevoke(null)
      await refresh()
    }
  }

  const hasMembers = members.length > 0

  return (
    <div className="space-y-6 text-sm">
      {/* Top bar: stat chips on the left, primary invite CTA on the
          right. Keeps the "what is this page" summary + primary action
          visible at all times. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </span>
          {pendingCount > 0 && (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {pendingCount} pending
              </span>
            </>
          )}
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            onClick={() => setInviteOpen(true)}
            leftIcon={<UserPlus size={14} aria-hidden="true" />}
          >
            Invite member
          </Button>
        )}
      </div>

      {/* Members section. */}
      <section aria-labelledby="members-heading" className="space-y-2">
        <h2
          id="members-heading"
          className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          Members ({memberCount})
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/60">
          {hasMembers ? (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800/60 p-1">
              {members.map((m) => (
                <MemberRow
                  key={m.user_id}
                  member={m}
                  isAdmin={isAdmin}
                  isSelf={m.user_id === selfId}
                  onChangeRole={async (next) => {
                    await updateMemberRole(team.id, m.user_id, next)
                    await refresh()
                  }}
                  onRemove={() => setPendingRemove(m)}
                />
              ))}
            </ul>
          ) : (
            <div className="p-8 text-center">
              <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <UserPlus size={18} aria-hidden="true" />
              </div>
              <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">
                No members yet
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Just you so far — invite teammates to start collaborating.
              </p>
              {isAdmin && (
                <div className="mt-4">
                  <Button
                    variant="primary"
                    onClick={() => setInviteOpen(true)}
                    leftIcon={<UserPlus size={14} aria-hidden="true" />}
                  >
                    Invite teammates
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Pending invites — hidden entirely when the list is empty. */}
      {invites.length > 0 && (
        <section aria-labelledby="invites-heading" className="space-y-2">
          <h2
            id="invites-heading"
            className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
          >
            Pending invites ({invites.length})
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/60">
            <ul className="divide-y divide-gray-100 dark:divide-gray-800/60 p-1">
              {invites.map((inv) => (
                <InviteRow
                  key={inv.id}
                  invite={inv}
                  canAct={isAdmin}
                  onCopy={copyInviteLink}
                  onResend={resendInvite}
                  onRevoke={(i) => setPendingRevoke(i)}
                  nowMs={nowMs}
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {pendingRemove && (
        <ConfirmDialog
          title="Remove team member?"
          body={
            <div className="space-y-2">
              <div>
                <strong>
                  {pendingRemove.name ?? pendingRemove.email ?? pendingRemove.user_id}
                </strong>{' '}
                ({pendingRemove.email ?? pendingRemove.user_id}) will lose
                access to every office in this team.
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                They'll need a new invite to rejoin.
              </div>
            </div>
          }
          confirmLabel="Remove member"
          tone="danger"
          onConfirm={async () => {
            const target = pendingRemove
            setPendingRemove(null)
            await removeMember(team.id, target.user_id)
            await refresh()
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}

      {pendingRevoke && (
        <ConfirmDialog
          title="Revoke this invite?"
          body={
            <div>
              <strong>{pendingRevoke.email}</strong> will no longer be
              able to join the team with the existing link.
            </div>
          }
          confirmLabel="Revoke invite"
          tone="danger"
          onConfirm={() => confirmRevoke(pendingRevoke)}
          onCancel={() => setPendingRevoke(null)}
        />
      )}

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        teamId={team.id}
        invitedBy={selfId}
        onInvited={() => {
          // Re-fetch so the new invite shows up in the Pending list
          // the moment the modal closes on the happy path.
          void refresh()
        }}
      />
    </div>
  )
}
