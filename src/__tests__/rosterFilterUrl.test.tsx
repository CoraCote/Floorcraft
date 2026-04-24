/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { RosterPage } from '../components/editor/RosterPage'

/**
 * Roster URL hygiene: (a) `day=<weekend>` used to silently produce an
 * empty roster because the filter predicate only knows Mon-Fri — sharing
 * a link from Saturday surfaced "why is my team gone?"; (b) the "Total"
 * chip used to `setSearchParams(new URLSearchParams())` and blow away
 * the user's intentional `q`/`dept`/`floor` scopes alongside the axis
 * chips. These tests lock in the fix for both.
 */

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.search}</div>
}

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/roster"
          element={
            <>
              <RosterPage />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/t/:teamSlug/o/:officeSlug/map"
          element={<div>Map page</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // URL hygiene assertions match against visible names; seat an editor role
  // so names render in full rather than as redacted initials.
  useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1', name: 'Alice', email: 'alice@example.com', department: 'Eng', team: null,
        title: null, managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: ['Mon', 'Tue', 'Wed'], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
      e2: {
        id: 'e2', name: 'Bob', email: 'bob@example.com', department: 'Sales', team: null,
        title: null, managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: ['Mon'], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
    },
  })
})

describe('Roster URL — day filter normalization', () => {
  it('drops day=Sat on mount (weekend days are not valid filter values)', () => {
    renderAtRoute('/t/acme/o/hq/roster?day=Sat')
    const loc = screen.getByTestId('loc')
    // Effect runs after mount — verify the param was stripped.
    expect(loc.textContent ?? '').not.toMatch(/day=Sat/)
    // Both employees still visible; the bogus filter isn't silently hiding them.
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('keeps day=Mon (a valid weekday) untouched', () => {
    renderAtRoute('/t/acme/o/hq/roster?day=Mon')
    const loc = screen.getByTestId('loc')
    expect(loc.textContent ?? '').toMatch(/day=Mon/)
  })

  it('drops day=garbage too', () => {
    renderAtRoute('/t/acme/o/hq/roster?day=whenever')
    const loc = screen.getByTestId('loc')
    expect(loc.textContent ?? '').not.toMatch(/day=/)
  })
})

describe('Roster URL — Total chip scope', () => {
  it('clears axis chip filters but preserves q / dept / floor', () => {
    // Start with a mix: user-scoped (q + dept) AND axis chips (status + seat + day + preset).
    renderAtRoute(
      '/t/acme/o/hq/roster?q=ali&dept=Eng&status=active&seat=unassigned&day=Mon&preset=ending-soon',
    )
    const totalBtn = screen.getByRole('button', { name: /Total/i })
    act(() => { fireEvent.click(totalBtn) })
    const loc = screen.getByTestId('loc')
    const search = loc.textContent ?? ''
    // Axis chips are gone.
    expect(search).not.toMatch(/status=/)
    expect(search).not.toMatch(/seat=/)
    expect(search).not.toMatch(/day=/)
    expect(search).not.toMatch(/preset=/)
    // User-set scopes survived.
    expect(search).toMatch(/q=ali/)
    expect(search).toMatch(/dept=Eng/)
  })

  it('leaves floor= intact too', () => {
    renderAtRoute('/t/acme/o/hq/roster?floor=f1&status=active')
    const totalBtn = screen.getByRole('button', { name: /Total/i })
    act(() => { fireEvent.click(totalBtn) })
    const search = screen.getByTestId('loc').textContent ?? ''
    expect(search).toMatch(/floor=f1/)
    expect(search).not.toMatch(/status=/)
  })
})
