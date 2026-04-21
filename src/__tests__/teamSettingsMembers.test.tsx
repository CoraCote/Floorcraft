import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  beforeEach(() => {
    list.mockReset()
    listInv.mockReset()
    invite.mockReset()
    invokeFn.mockReset()
    list.mockResolvedValue([])
    listInv.mockResolvedValue([])
  })

  it('invites a teammate by email', async () => {
    invite.mockResolvedValue({ token: 'tok-1', team_id: 't1', email: 'x@y.z' })
    invokeFn.mockResolvedValue({ data: { ok: true }, error: null })
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findAllByText(/no members yet|invite teammates/i)
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'x@y.z' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    await waitFor(() => expect(invite).toHaveBeenCalledWith('t1', 'x@y.z', 'u1'))
    await waitFor(() =>
      expect(invokeFn).toHaveBeenCalledWith('send-invite-email', { body: { token: 'tok-1' } }),
    )
  })

  it('shows the invite link with a success message when the email goes out', async () => {
    invite.mockResolvedValue({ token: 'tok-ok', team_id: 't1', email: 'happy@y.z' })
    invokeFn.mockResolvedValue({ data: { ok: true }, error: null })
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findAllByText(/invite teammates/i)
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'happy@y.z' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toMatch(/invite sent to happy@y\.z/i)
    const link = screen.getByLabelText(/invite link/i) as HTMLInputElement
    expect(link.value).toMatch(/\/invite\/tok-ok$/)
  })

  it('falls back to copy-link UX when the edge function returns an error', async () => {
    invite.mockResolvedValue({ token: 'tok-fail', team_id: 't1', email: 'manual@y.z' })
    invokeFn.mockResolvedValue({ data: null, error: { message: 'Function not found' } })
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findAllByText(/invite teammates/i)
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'manual@y.z' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toMatch(/couldn't be sent/i)
    expect(banner.textContent).toMatch(/manual@y\.z/i)
    const link = screen.getByLabelText(/invite link/i) as HTMLInputElement
    expect(link.value).toMatch(/\/invite\/tok-fail$/)
    // No red "Error" surface — the flow succeeded from the admin's
    // perspective because the invite row exists.
    expect(screen.queryByText(/function not found/i)).toBeNull()
  })

  it('falls back to copy-link UX when the edge function throws', async () => {
    invite.mockResolvedValue({ token: 'tok-throw', team_id: 't1', email: 'thrown@y.z' })
    invokeFn.mockRejectedValue(new Error('network boom'))
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findAllByText(/invite teammates/i)
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'thrown@y.z' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toMatch(/couldn't be sent/i)
    const link = screen.getByLabelText(/invite link/i) as HTMLInputElement
    expect(link.value).toMatch(/\/invite\/tok-throw$/)
    expect(screen.queryByText(/network boom/i)).toBeNull()
  })
})
