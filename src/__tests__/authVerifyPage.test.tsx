import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthVerifyPage } from '../components/auth/AuthVerifyPage'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: rpcMock },
}))

describe('AuthVerifyPage', () => {
  it('renders the in-flight verifying state when first mounted', () => {
    // No pending invite token → the effect resolves to navigate() on
    // next tick; before that happens synchronously, we should see the
    // centered "Verifying your email…" heading.
    sessionStorage.removeItem('pending_invite_token')
    render(
      <MemoryRouter>
        <AuthVerifyPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: /verifying your email/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/this only takes a second/i)).toBeInTheDocument()
  })
})
