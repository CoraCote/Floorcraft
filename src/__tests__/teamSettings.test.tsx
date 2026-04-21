import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TeamSettingsGeneral } from '../components/team/TeamSettingsGeneral'

const { renameTeam, deleteTeam } = vi.hoisted(() => ({
  renameTeam: vi.fn(),
  deleteTeam: vi.fn(),
}))
vi.mock('../lib/teams/teamRepository', () => ({
  renameTeam: (...a: unknown[]) => renameTeam(...a),
  deleteTeam: (...a: unknown[]) => deleteTeam(...a),
}))

describe('TeamSettingsGeneral', () => {
  const team = { id: 't1', slug: 'acme', name: 'Acme', created_by: 'u1', created_at: '' }
  it('renames the team', async () => {
    renameTeam.mockResolvedValue(undefined)
    render(<MemoryRouter><TeamSettingsGeneral team={team} isAdmin /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Acme 2' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(renameTeam).toHaveBeenCalledWith('t1', 'Acme 2'))
  })
})
