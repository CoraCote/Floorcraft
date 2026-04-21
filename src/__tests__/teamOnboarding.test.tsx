import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TeamOnboardingPage } from '../components/team/TeamOnboardingPage'

const { createTeam } = vi.hoisted(() => ({ createTeam: vi.fn() }))
vi.mock('../lib/teams/teamRepository', () => ({
  createTeam: (...args: unknown[]) => createTeam(...args),
}))
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } }),
}))

describe('TeamOnboardingPage', () => {
  it('creates a team and navigates to its slug', async () => {
    createTeam.mockResolvedValue({ id: 't1', slug: 'acme', name: 'Acme' })
    render(
      <MemoryRouter initialEntries={['/onboarding/team']}>
        <Routes>
          <Route path="/onboarding/team" element={<TeamOnboardingPage />} />
          <Route path="/t/:slug" element={<div>team-home</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Acme' } })
    fireEvent.click(screen.getByRole('button', { name: /create team/i }))
    await waitFor(() => expect(createTeam).toHaveBeenCalledWith('Acme', 'u1'))
    expect(await screen.findByText('team-home')).toBeInTheDocument()
  })
})
