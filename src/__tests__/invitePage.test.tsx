import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { InvitePage } from '../components/team/InvitePage'

const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: rpcMock, from: (...args: unknown[]) => fromMock(...args) },
}))
vi.mock('../lib/auth/session', () => ({ useSession: vi.fn() }))
import { useSession } from '../lib/auth/session'

beforeEach(() => {
  rpcMock.mockReset()
  fromMock.mockReset()
})

function mockTeams(rows: Array<{ slug: string }>) {
  fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ single: () => ({ data: rows[0] ?? null, error: null }) }) }),
  })
}

describe('InvitePage', () => {
  it('redirects to signup with token when unauthenticated', async () => {
    vi.mocked(useSession).mockReturnValue({ status: 'unauthenticated' })
    render(
      <MemoryRouter initialEntries={['/invite/tok-1']}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/signup" element={<div>signup-page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('signup-page')).toBeInTheDocument())
  })

  it('accepts and navigates to team home when authenticated', async () => {
    vi.mocked(useSession).mockReturnValue({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } })
    rpcMock.mockResolvedValue({ data: 'team-abc', error: null })
    mockTeams([{ slug: 'acme' }])
    render(
      <MemoryRouter initialEntries={['/invite/tok-1']}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/t/:slug" element={<div>team-home</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /accept/i }))
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('accept_invite', { invite_token: 'tok-1' }))
    expect(await screen.findByText('team-home')).toBeInTheDocument()
  })
})
