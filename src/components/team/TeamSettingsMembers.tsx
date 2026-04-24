import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/auth/session'
import type { Team, TeamMember, Invite } from '../../types/team'
import {
  listTeamMembers,
  listInvites,
  createInvite,
  removeMember,
  updateMemberRole,
} from '../../lib/teams/teamRepository'
import { ConfirmDialog } from '../editor/ConfirmDialog'

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
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * The last invite we created locally, plus whether the transactional
   * email went out. We show the shareable link either way — if mail is
   * available the admin gets "sent + copy link", if the edge function
   * failed they get "copy the link and share it manually". Keeps the
   * invite flow unblocked when Resend / the edge function isn't
   * deployed yet.
   */
  const [lastInvite, setLastInvite] = useState<{
    email: string
    url: string
    emailed: boolean
  } | null>(null)
  // Target of the pending remove confirmation. `null` means no dialog is
  // open. Storing the full member (not just the id) lets the dialog body
  // show the email/name without re-querying the list.
  const [pendingRemove, setPendingRemove] = useState<TeamMember | null>(null)

  async function refresh() {
    setMembers(await listTeamMembers(team.id))
    setInvites(await listInvites(team.id))
  }
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id])

  async function onInvite() {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    try {
      const inv = await createInvite(team.id, email.trim().toLowerCase(), selfId)
      const url = `${window.location.origin}/invite/${inv.token}`
      // Invoke the send-email edge function but don't let its failure
      // tank the flow: the invite row exists, we have a valid token,
      // the admin can copy the link and share it manually.
      let emailed = false
      try {
        const { error: fnErr } = await supabase.functions.invoke('send-invite-email', {
          body: { token: inv.token },
        })
        emailed = !fnErr
      } catch {
        emailed = false
      }
      setLastInvite({ email: inv.email, url, emailed })
      setEmail('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  async function copyInviteLink() {
    if (!lastInvite) return
    try {
      await navigator.clipboard.writeText(lastInvite.url)
    } catch {
      // Clipboard can fail silently in insecure contexts / tests;
      // the link text is visible on screen either way.
    }
  }

  return (
    <div className="space-y-6 text-sm max-w-2xl">
      <section className="space-y-2">
        <h2 className="font-semibold">Members</h2>
        {members.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No members yet.</p>
        ) : (
          <table className="w-full border rounded overflow-hidden">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t">
                  <td className="p-2">{m.name ?? '—'}</td>
                  <td className="p-2">{m.email ?? '—'}</td>
                  <td className="p-2">
                    {isAdmin && m.user_id !== selfId ? (
                      <select
                        value={m.role}
                        onChange={async (e) => {
                          await updateMemberRole(team.id, m.user_id, e.target.value as 'admin' | 'member')
                          refresh()
                        }}
                        className="border rounded px-1 py-0.5"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      m.role
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {isAdmin && m.user_id !== selfId && (
                      <button
                        onClick={() => setPendingRemove(m)}
                        className="text-red-600 dark:text-red-400 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
            refresh()
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}

      {isAdmin && (
        <section className="space-y-2">
          <h2 className="font-semibold">Invite teammates</h2>
          <div className="flex gap-2 items-end">
            <label className="flex-1">
              <span className="block mb-1 text-gray-600 dark:text-gray-300">Email</span>
              <input
                type="email"
                className="w-full border rounded px-2 py-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              onClick={onInvite}
              disabled={busy}
              className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
          {lastInvite && (
            <div
              className="mt-2 p-3 border rounded bg-blue-50 dark:bg-blue-950/40 space-y-2"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm">
                {lastInvite.emailed
                  ? `Invite sent to ${lastInvite.email}. You can also copy the link below.`
                  : `Invite created for ${lastInvite.email}, but the email couldn't be sent. Copy the link below and share it manually.`}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={lastInvite.url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Invite link"
                  className="flex-1 border rounded px-2 py-1 text-xs font-mono bg-white dark:bg-gray-900"
                />
                <button
                  onClick={copyInviteLink}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                  type="button"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          {invites.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Pending invites</h3>
              <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                {invites.map((i) => (
                  <li key={i.id}>
                    {i.email} — expires {new Date(i.expires_at).toLocaleDateString()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
