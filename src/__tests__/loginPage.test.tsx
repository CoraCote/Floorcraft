import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../components/auth/LoginPage'

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: signInMock } },
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('submits email + password to Supabase', async () => {
    signInMock.mockResolvedValue({ data: {}, error: null })
    renderLogin()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith({ email: 'a@b.c', password: 'hunter2' }),
    )
  })

  it('shows an error when sign-in fails', async () => {
    signInMock.mockResolvedValue({ data: {}, error: { message: 'Invalid login' } })
    renderLogin()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(screen.getByText(/invalid login/i)).toBeInTheDocument())
  })
})
