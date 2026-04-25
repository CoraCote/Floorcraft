import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { InvitePage } from '../components/team/InvitePage'
import * as preview from '../lib/invitePreview'

vi.mock('../lib/invitePreview', () => ({ previewInvite: vi.fn() }))
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1' } }),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }) }),
  },
}))

beforeEach(() => {
  vi.mocked(preview.previewInvite).mockReset()
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/invite/abc-123']}>
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Invite preview', () => {
  it('renders inviter + team name when preview resolves', async () => {
    vi.mocked(preview.previewInvite).mockResolvedValue({
      teamName: 'Acme Corp',
      inviterName: 'Sarah',
    })
    mount()
    // Wave 17C: the invite page now splits the greeting across two
    // lines — "You've been invited to join {team}" and "Invited by
    // {inviter}" — so match the two pieces individually instead of
    // one concatenated string.
    await waitFor(() =>
      expect(screen.getByText(/Acme Corp/i)).toBeInTheDocument(),
    )
    expect(screen.getByText(/Invited by/i)).toBeInTheDocument()
    expect(screen.getByText(/Sarah/)).toBeInTheDocument()
  })

  it('shows not-valid message when preview returns null', async () => {
    vi.mocked(preview.previewInvite).mockResolvedValue(null)
    mount()
    await waitFor(() => expect(screen.getByText(/isn't valid|not valid/i)).toBeInTheDocument())
  })
})
