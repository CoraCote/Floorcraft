import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TeamSettingsMembers } from '../components/team/TeamSettingsMembers'

/**
 * Wave 17C: The members tab was restructured so the invite form lives
 * in a Modal triggered by an "Invite member" button. The tests here
 * cover the flows end-to-end (open modal → submit → success toast or
 * fallback copy-link state) as well as the existing role + remove
 * management surface.
 */

const { list, listInv, invite, removeM, roleU, invokeFn, fromFn } = vi.hoisted(() => ({
  list: vi.fn(),
  listInv: vi.fn(),
  invite: vi.fn(),
  removeM: vi.fn(),
  roleU: vi.fn(),
  invokeFn: vi.fn(),
  fromFn: vi.fn(),
}))
vi.mock('../lib/teams/teamRepository', () => ({
  listTeamMembers: (...a: unknown[]) => list(...a),
  listInvites: (...a: unknown[]) => listInv(...a),
  createInvite: (...a: unknown[]) => invite(...a),
  removeMember: (...a: unknown[]) => removeM(...a),
  updateMemberRole: (...a: unknown[]) => roleU(...a),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeFn(...a) },
    from: (...a: unknown[]) => fromFn(...a),
  },
}))

const team = { id: 't1', slug: 'acme', name: 'Acme', created_by: 'u1', created_at: '' }

async function openInviteModal() {
  fireEvent.click(screen.getByRole('button', { name: /invite member/i }))
  // The modal uses the shared `<Modal>` primitive which renders a
  // portal; the title field becomes the dialog name.
  return await screen.findByRole('dialog', { name: /invite teammate/i })
}

describe('TeamSettingsMembers', () => {
  beforeEach(() => {
    list.mockReset()
    listInv.mockReset()
    invite.mockReset()
    removeM.mockReset()
    roleU.mockReset()
    invokeFn.mockReset()
    fromFn.mockReset()
    list.mockResolvedValue([])
    listInv.mockResolvedValue([])
    removeM.mockResolvedValue(undefined)
  })

  it('renders the empty-state when there are no members', async () => {
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    expect(await screen.findByText(/no members yet/i)).toBeInTheDocument()
  })

  it('opens the invite modal and submits a valid email', async () => {
    invite.mockResolvedValue({ id: 'i1', token: 'tok-1', team_id: 't1', email: 'x@y.z' })
    invokeFn.mockResolvedValue({ data: { ok: true }, error: null })
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findByText(/no members yet/i)
    await openInviteModal()
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'x@y.z' } })
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
    await waitFor(() => expect(invite).toHaveBeenCalledWith('t1', 'x@y.z', 'u1'))
    await waitFor(() =>
      expect(invokeFn).toHaveBeenCalledWith('send-invite-email', { body: { token: 'tok-1' } }),
    )
  })

  it('disables the submit button for a blank email', async () => {
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findByText(/no members yet/i)
    await openInviteModal()
    expect(screen.getByRole('button', { name: /send invitation/i })).toBeDisabled()
  })

  it('surfaces an invalid-email hint when the email is malformed', async () => {
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findByText(/no members yet/i)
    await openInviteModal()
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'not-an-email' } })
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send invitation/i })).toBeDisabled()
  })

  it('falls back to the copy-link surface when the edge function errors', async () => {
    invite.mockResolvedValue({ id: 'i2', token: 'tok-fail', team_id: 't1', email: 'manual@y.z' })
    invokeFn.mockResolvedValue({ data: null, error: { message: 'Function not found' } })
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findByText(/no members yet/i)
    await openInviteModal()
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'manual@y.z' } })
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
    // The modal stays open and swaps to the fallback surface.
    const fallback = await screen.findByRole('dialog', { name: /share this invitation/i })
    expect(fallback.textContent).toMatch(/couldn't be sent/i)
    const link = screen.getByLabelText(/invite link/i) as HTMLInputElement
    expect(link.value).toMatch(/\/invite\/tok-fail$/)
    // No raw backend error leaks through — it's humanized.
    expect(screen.queryByText(/function not found/i)).toBeNull()
  })

  it('falls back to the copy-link surface when the edge function throws', async () => {
    invite.mockResolvedValue({ id: 'i3', token: 'tok-throw', team_id: 't1', email: 'thrown@y.z' })
    invokeFn.mockRejectedValue(new Error('network boom'))
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findByText(/no members yet/i)
    await openInviteModal()
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'thrown@y.z' } })
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }))
    const fallback = await screen.findByRole('dialog', { name: /share this invitation/i })
    expect(fallback.textContent).toMatch(/couldn't be sent/i)
    const link = screen.getByLabelText(/invite link/i) as HTMLInputElement
    expect(link.value).toMatch(/\/invite\/tok-throw$/)
    expect(screen.queryByText(/network boom/i)).toBeNull()
  })

  it('renders member rows with role badges and gates the actions menu on permission', async () => {
    list.mockResolvedValue([
      { user_id: 'u1', role: 'admin', email: 'me@acme.co', name: 'Me', joined_at: new Date().toISOString() },
      { user_id: 'u2', role: 'member', email: 'bob@acme.co', name: 'Bob', joined_at: new Date().toISOString() },
    ])
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    // Both rows surface.
    await screen.findByText('Bob')
    expect(screen.getByText(/me@acme\.co/i)).toBeInTheDocument()
    // The admin badge shows up for the admin row.
    expect(screen.getAllByText(/admin/i).length).toBeGreaterThan(0)
    // Self row has no actions menu; Bob's row does.
    expect(screen.queryByRole('button', { name: /actions for me/i })).toBeNull()
    expect(screen.getByRole('button', { name: /actions for bob/i })).toBeInTheDocument()
  })

  it('non-admins do not see the Invite member button or row menus', async () => {
    list.mockResolvedValue([
      { user_id: 'u1', role: 'member', email: 'me@acme.co', name: 'Me', joined_at: new Date().toISOString() },
      { user_id: 'u2', role: 'member', email: 'bob@acme.co', name: 'Bob', joined_at: new Date().toISOString() },
    ])
    render(<TeamSettingsMembers team={team} isAdmin={false} selfId="u1" />)
    await screen.findByText('Bob')
    expect(screen.queryByRole('button', { name: /invite member/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /actions for bob/i })).toBeNull()
  })

  it('opens a ConfirmDialog before removing a member and calls removeMember', async () => {
    list.mockResolvedValue([
      { user_id: 'u1', role: 'admin', email: 'me@acme.co', name: 'Me', joined_at: new Date().toISOString() },
      { user_id: 'u2', role: 'member', email: 'bob@acme.co', name: 'Bob', joined_at: new Date().toISOString() },
    ])
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findByText('Bob')
    fireEvent.click(screen.getByRole('button', { name: /actions for bob/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /remove/i }))
    const dialog = await screen.findByRole('dialog', { name: /remove team member/i })
    expect(dialog.textContent).toMatch(/bob@acme\.co/i)
    expect(removeM).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^remove member$/i }))
    await waitFor(() => expect(removeM).toHaveBeenCalledWith('t1', 'u2'))
  })

  it('cancels the remove flow without calling removeMember', async () => {
    list.mockResolvedValue([
      { user_id: 'u1', role: 'admin', email: 'me@acme.co', name: 'Me', joined_at: new Date().toISOString() },
      { user_id: 'u2', role: 'member', email: 'bob@acme.co', name: 'Bob', joined_at: new Date().toISOString() },
    ])
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findByText('Bob')
    fireEvent.click(screen.getByRole('button', { name: /actions for bob/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /remove/i }))
    await screen.findByRole('dialog', { name: /remove team member/i })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /remove team member/i })).toBeNull(),
    )
    expect(removeM).not.toHaveBeenCalled()
  })
})
