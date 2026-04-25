import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthResetPage } from '../components/auth/AuthResetPage'
import { useToastStore } from '../stores/toastStore'

const { updateUserMock } = vi.hoisted(() => ({ updateUserMock: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { updateUser: updateUserMock } },
}))

function renderReset() {
  return render(
    <MemoryRouter>
      <AuthResetPage />
    </MemoryRouter>,
  )
}

describe('AuthResetPage', () => {
  it('renders the heading, both password fields, and the submit button', () => {
    renderReset()
    expect(
      screen.getByRole('heading', { name: /choose a new password/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
  })

  it('blocks the supabase call when the two passwords do not match', async () => {
    updateUserMock.mockResolvedValue({ data: {}, error: null })
    renderReset()
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'hunter2hunter' },
    })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'hunter3hunter' },
    })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent(/don't match/i)
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('submits the new password and pushes a success toast', async () => {
    updateUserMock.mockResolvedValue({ data: {}, error: null })
    // Reset the toast store between cases so we can assert on fresh state.
    useToastStore.setState({ items: [] })
    renderReset()
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'hunter2hunter' },
    })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'hunter2hunter' },
    })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() =>
      expect(updateUserMock).toHaveBeenCalledWith({ password: 'hunter2hunter' }),
    )
    await waitFor(() => {
      const toasts = useToastStore.getState().items
      expect(toasts.some((t) => /password updated/i.test(t.title))).toBe(true)
    })
  })
})
