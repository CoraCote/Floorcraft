import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SignupPage } from '../components/auth/SignupPage'

const { signUpMock } = vi.hoisted(() => ({ signUpMock: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signUp: signUpMock } },
}))

describe('SignupPage', () => {
  it('submits email, password, name', async () => {
    signUpMock.mockResolvedValue({ data: {}, error: null })
    render(
      <MemoryRouter initialEntries={['/signup']}>
        <SignupPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(signUpMock).toHaveBeenCalledWith({
        email: 'a@b.c',
        password: 'hunter2',
        options: { data: { name: 'Alice' } },
      }),
    )
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument()
  })

  it('pre-fills email when an invite token is in the URL', async () => {
    signUpMock.mockResolvedValue({ data: {}, error: null })
    render(
      <MemoryRouter initialEntries={['/signup?invite=abc&email=bob%40a.test']}>
        <SignupPage />
      </MemoryRouter>,
    )
    const email = screen.getByLabelText(/email/i) as HTMLInputElement
    expect(email.value).toBe('bob@a.test')
    expect(email.readOnly).toBe(true)
  })
})
