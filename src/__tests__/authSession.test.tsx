import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useSession } from '../lib/auth/AuthProvider'

vi.mock('../lib/supabase', () => {
  const listener = { callback: null as null | ((e: string, s: unknown) => void) }
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn((cb) => {
          listener.callback = cb
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
      },
      __listener: listener,
    },
  }
})

function Probe() {
  const session = useSession()
  return <div>status:{session.status}</div>
}

describe('AuthProvider', () => {
  it('starts loading, then resolves to unauthenticated', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByText(/status:loading/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/status:unauthenticated/)).toBeInTheDocument())
  })
})
