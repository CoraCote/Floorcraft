import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthVerifyPage } from '../components/auth/AuthVerifyPage'
import { AuthResetPage } from '../components/auth/AuthResetPage'

const { rpcMock, updateUserMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  updateUserMock: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: rpcMock, auth: { updateUser: updateUserMock } },
}))

beforeEach(() => {
  rpcMock.mockReset()
  updateUserMock.mockReset()
  sessionStorage.clear()
})

describe('AuthVerifyPage', () => {
  it('consumes a pending invite token after verification', async () => {
    sessionStorage.setItem('pending_invite_token', 'tok-123')
    rpcMock.mockResolvedValue({ data: 'team-abc', error: null })
    render(
      <MemoryRouter initialEntries={['/auth/verify']}>
        <Routes>
          <Route path="/auth/verify" element={<AuthVerifyPage />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
          <Route path="/t/:slug" element={<div>team-home</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('accept_invite', { invite_token: 'tok-123' }))
  })
})

describe('AuthResetPage', () => {
  it('calls updateUser with new password', async () => {
    updateUserMock.mockResolvedValue({ data: {}, error: null })
    render(
      <MemoryRouter initialEntries={['/auth/reset']}>
        <AuthResetPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpass!!' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ password: 'newpass!!' }))
  })
})
