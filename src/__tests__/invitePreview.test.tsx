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
    await waitFor(() =>
      expect(screen.getByText(/Sarah invited you to Acme Corp/i)).toBeInTheDocument(),
    )
  })

  it('shows not-valid message when preview returns null', async () => {
    vi.mocked(preview.previewInvite).mockResolvedValue(null)
    mount()
    await waitFor(() => expect(screen.getByText(/not valid/i)).toBeInTheDocument())
  })
})
