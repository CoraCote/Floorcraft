import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TeamSettingsMembers } from '../components/team/TeamSettingsMembers'

const { list, listInv, invite, removeM, roleU, invokeFn } = vi.hoisted(() => ({
  list: vi.fn(),
  listInv: vi.fn(),
  invite: vi.fn(),
  removeM: vi.fn(),
  roleU: vi.fn(),
  invokeFn: vi.fn(),
}))
vi.mock('../lib/teams/teamRepository', () => ({
  listTeamMembers: (...a: unknown[]) => list(...a),
  listInvites: (...a: unknown[]) => listInv(...a),
  createInvite: (...a: unknown[]) => invite(...a),
  removeMember: (...a: unknown[]) => removeM(...a),
  updateMemberRole: (...a: unknown[]) => roleU(...a),
}))
vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeFn(...a) } },
}))

const team = { id: 't1', slug: 'acme', name: 'Acme', created_by: 'u1', created_at: '' }

describe('TeamSettingsMembers', () => {
  it('invites a teammate by email', async () => {
    list.mockResolvedValue([])
    listInv.mockResolvedValue([])
    invite.mockResolvedValue({ token: 'tok-1', team_id: 't1', email: 'x@y.z' })
    invokeFn.mockResolvedValue({ data: { ok: true }, error: null })
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    // Plan says findByText with an alternation regex, but both headings render,
    // so use findAllByText to tolerate both matches while still awaiting the refresh.
    await screen.findAllByText(/no members yet|invite teammates/i)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'x@y.z' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    await waitFor(() => expect(invite).toHaveBeenCalledWith('t1', 'x@y.z', 'u1'))
    await waitFor(() => expect(invokeFn).toHaveBeenCalledWith('send-invite-email', { body: { token: 'tok-1' } }))
  })
})
