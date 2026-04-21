import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ForgotPasswordPage } from '../components/auth/ForgotPasswordPage'

const { resetMock } = vi.hoisted(() => ({ resetMock: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: resetMock } },
}))

describe('ForgotPasswordPage', () => {
  it('calls resetPasswordForEmail and shows confirmation', async () => {
    resetMock.mockResolvedValue({ data: {}, error: null })
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith('a@b.c', expect.any(Object)))
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })
})
