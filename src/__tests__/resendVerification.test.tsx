import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ResendVerificationButton } from '../components/team/ResendVerificationButton'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { resend: vi.fn().mockResolvedValue({ error: null }) },
  },
}))

import { supabase } from '../lib/supabase'

beforeEach(() => {
  vi.mocked(supabase.auth.resend)
    .mockClear()
    .mockResolvedValue({ error: null } as never)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ResendVerificationButton', () => {
  it('disables for 30 seconds after a successful send, then re-enables', async () => {
    render(<ResendVerificationButton email="test@example.com" />)
    const btn = screen.getByRole('button')
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(vi.mocked(supabase.auth.resend)).toHaveBeenCalledOnce()
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText(/available in 30s/i)).toBeInTheDocument()

    // Tick the timer 29 times with intervening flushes — each setTimeout
    // schedules only the NEXT tick when it fires, so we need React to
    // commit the new `remaining` state between advances or subsequent
    // effects never re-arm the timer.
    for (let i = 0; i < 29; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1_000)
      })
    }
    expect(screen.getByText(/available in 1s/i)).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(screen.getByRole('button')).not.toBeDisabled()
    expect(screen.getByText(/resend verification email/i)).toBeInTheDocument()
  })

  it('surfaces resend errors inline', async () => {
    vi.mocked(supabase.auth.resend).mockResolvedValueOnce({
      error: { message: 'rate limited' },
    } as never)
    render(<ResendVerificationButton email="test@example.com" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByText(/rate limited/i)).toBeInTheDocument()
    expect(screen.getByRole('button')).not.toBeDisabled()
  })
})
