import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import { TeamSwitcher } from '../components/team/TeamSwitcher'

function TeamSwitcherAtRoute() {
  const { teamSlug } = useParams<{ teamSlug: string }>()
  return <TeamSwitcher currentSlug={teamSlug} />
}

// `useMyTeams` normally does a Supabase round-trip on mount; stub it to
// return two teams synchronously so the test can focus on dropdown
// behaviour, not data-loading states.
vi.mock('../lib/teams/useMyTeams', () => ({
  useMyTeams: () => [
    { id: 't1', slug: 'acme', name: 'Acme', created_by: '', created_at: '' },
    { id: 't2', slug: 'beta', name: 'Beta', created_by: '', created_at: '' },
  ],
}))

function renderWithRouter(initialPath: string) {
  // We render TeamSwitcher at a catch-all `/t/:teamSlug/*` route so the
  // navigate() inside the dropdown produces a real URL change that we
  // can assert against, rather than a Memory router no-op.
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/t/:teamSlug/*" element={<TeamSwitcherAtRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TeamSwitcher', () => {
  it('shows the current team name and lists all teams when opened', () => {
    renderWithRouter('/t/acme')
    expect(screen.getByRole('button', { name: /acme/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /acme/i }))
    // Both teams appear as menu items; the current team is included so the
    // user can see what they're switching away from.
    expect(screen.getByRole('menuitem', { name: /acme/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /beta/i })).toBeTruthy()
  })

  it('navigates to the selected team', () => {
    renderWithRouter('/t/acme')
    fireEvent.click(screen.getByRole('button', { name: /acme/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /beta/i }))
    // The heading updates to Beta, which only happens if the route-level
    // currentSlug changed — i.e. navigate() worked.
    expect(screen.getByRole('button', { name: /beta/i })).toBeTruthy()
  })

  it('exposes a "Create team" affordance', () => {
    renderWithRouter('/t/acme')
    fireEvent.click(screen.getByRole('button', { name: /acme/i }))
    expect(screen.getByRole('button', { name: /create team/i })).toBeTruthy()
  })
})
