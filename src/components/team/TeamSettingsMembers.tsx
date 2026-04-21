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
      const { error: fnErr } = await supabase.functions.invoke('send-invite-email', { body: { token: inv.token } })
      if (fnErr) throw new Error(fnErr.message)
      setEmail('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="space-y-6 text-sm max-w-2xl">
      <section className="space-y-2">
        <h2 className="font-semibold">Members</h2>
        {members.length === 0 ? (
          <p className="text-gray-500">No members yet.</p>
        ) : (
          <table className="w-full border rounded overflow-hidden">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
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
                        onClick={async () => {
                          if (confirm(`Remove ${m.email}?`)) {
                            await removeMember(team.id, m.user_id)
                            refresh()
                          }
                        }}
                        className="text-red-600 hover:underline"
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

      {isAdmin && (
        <section className="space-y-2">
          <h2 className="font-semibold">Invite teammates</h2>
          <div className="flex gap-2 items-end">
            <label className="flex-1">
              <span className="block mb-1 text-gray-600">Email</span>
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
          {error && <p className="text-red-600">{error}</p>}
          {invites.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-1">Pending invites</h3>
              <ul className="text-xs text-gray-600 space-y-1">
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
