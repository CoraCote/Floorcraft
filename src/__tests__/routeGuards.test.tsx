import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RequireAuth } from '../components/auth/RequireAuth'

vi.mock('../lib/auth/session', () => ({
  useSession: vi.fn(),
}))
import { useSession } from '../lib/auth/session'

describe('RequireAuth', () => {
  it('redirects to /login with next when unauthenticated', async () => {
    vi.mocked(useSession).mockReturnValue({ status: 'unauthenticated' })
    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route path="/private" element={<RequireAuth><div>secret</div></RequireAuth>} />
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('login-page')).toBeInTheDocument())
  })

  it('renders children when authenticated', () => {
    vi.mocked(useSession).mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', email: 'a@b.c' },
    })
    render(
      <MemoryRouter>
        <RequireAuth><div>secret</div></RequireAuth>
      </MemoryRouter>,
    )
    expect(screen.getByText('secret')).toBeInTheDocument()
  })
})
