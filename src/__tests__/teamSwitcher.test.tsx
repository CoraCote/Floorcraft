import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import { TeamSwitcher } from '../components/team/TeamSwitcher'
import type { Team } from '../types/team'

function TeamSwitcherAtRoute() {
  const { teamSlug } = useParams<{ teamSlug: string }>()
  return <TeamSwitcher currentSlug={teamSlug} />
}

// `useMyTeams` normally does a Supabase round-trip on mount; the mock
// factory below returns a mutable array so individual tests can swap
// the team list (e.g. to exercise the search-threshold behaviour).
const mockTeams: { value: Team[] } = {
  value: [
    { id: 't1', slug: 'acme', name: 'Acme', created_by: '', created_at: '' },
    { id: 't2', slug: 'beta', name: 'Beta', created_by: '', created_at: '' },
  ],
}
vi.mock('../lib/teams/useMyTeams', () => ({
  useMyTeams: () => mockTeams.value,
}))

function renderWithRouter(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/t/:teamSlug/*" element={<TeamSwitcherAtRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TeamSwitcher', () => {
  beforeEach(() => {
    mockTeams.value = [
      { id: 't1', slug: 'acme', name: 'Acme', created_by: '', created_at: '' },
      { id: 't2', slug: 'beta', name: 'Beta', created_by: '', created_at: '' },
    ]
  })

  it('renders the current team name on the trigger', () => {
    renderWithRouter('/t/acme')
    expect(screen.getByTestId('team-switcher-trigger').textContent).toMatch(/acme/i)
  })

  it('opens the dropdown on click and lists both teams under Switch team', () => {
    renderWithRouter('/t/acme')
    fireEvent.click(screen.getByTestId('team-switcher-trigger'))
    expect(screen.getByTestId('team-switcher-panel')).toBeTruthy()
    expect(screen.getByTestId('team-switcher-team-acme')).toBeTruthy()
    expect(screen.getByTestId('team-switcher-team-beta')).toBeTruthy()
  })

  it('navigates to the selected team when a Switch team row is clicked', () => {
    renderWithRouter('/t/acme')
    fireEvent.click(screen.getByTestId('team-switcher-trigger'))
    fireEvent.click(screen.getByTestId('team-switcher-team-beta'))
    // Heading reflects the route-level param, so Beta on the trigger
    // means navigate() actually ran.
    expect(screen.getByTestId('team-switcher-trigger').textContent).toMatch(/beta/i)
  })

  it('hides the Switch team group when the user has only one team', () => {
    mockTeams.value = [
      { id: 't1', slug: 'acme', name: 'Acme', created_by: '', created_at: '' },
    ]
    renderWithRouter('/t/acme')
    fireEvent.click(screen.getByTestId('team-switcher-trigger'))
    // The header "Switch team" should not appear.
    const panel = screen.getByTestId('team-switcher-panel')
    expect(panel.textContent).not.toMatch(/switch team/i)
    // But Help + Create still render.
    expect(screen.getByTestId('team-switcher-help')).toBeTruthy()
  })

  it('renders the "Create new team" affordance in the footer', () => {
    renderWithRouter('/t/acme')
    fireEvent.click(screen.getByTestId('team-switcher-trigger'))
    expect(screen.getByText(/create new team/i)).toBeTruthy()
  })

  it('renders a search input when the user has 9+ teams and filters the list', () => {
    mockTeams.value = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      slug: `team-${i}`,
      name: i === 3 ? 'Zebra' : `Team ${i}`,
      created_by: '',
      created_at: '',
    }))
    renderWithRouter('/t/team-0')
    fireEvent.click(screen.getByTestId('team-switcher-trigger'))
    const search = screen.getByTestId('team-switcher-search') as HTMLInputElement
    expect(search).toBeTruthy()
    act(() => {
      fireEvent.change(search, { target: { value: 'zeb' } })
    })
    // Only the "Zebra" team row remains after filtering.
    expect(screen.queryByTestId('team-switcher-team-team-0')).toBeNull()
    expect(screen.getByTestId('team-switcher-team-team-3')).toBeTruthy()
  })

  it('does not render a search input for small team lists', () => {
    renderWithRouter('/t/acme')
    fireEvent.click(screen.getByTestId('team-switcher-trigger'))
    expect(screen.queryByTestId('team-switcher-search')).toBeNull()
  })
})
