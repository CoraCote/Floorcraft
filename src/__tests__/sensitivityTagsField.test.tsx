/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { RosterPage } from '../components/editor/RosterPage'

/**
 * Exercises the Sensitivity tags section of `RosterDetailDrawer`:
 *   - Typing a comma/space-separated list + blurring persists tags to the store.
 *   - Each tag renders as a chip; clicking × removes that tag.
 *   - The field is disabled for viewers without `editRoster`.
 * Mirrors the route + store-seeding pattern used by
 * `rosterDetailDrawer.accommodations.test.tsx`.
 */

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/roster"
          element={<RosterPage />}
        />
        <Route
          path="/t/:teamSlug/o/:officeSlug/map"
          element={<div>Map page</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function seedEmployee(
  sensitivityTags: string[] = [],
  role: 'editor' | 'viewer' = 'editor',
) {
  useProjectStore.setState({ currentOfficeRole: role } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1',
        name: 'Alice',
        email: 'alice@example.com',
        department: 'Eng',
        team: null,
        title: null,
        managerId: null,
        employmentType: 'full-time',
        status: 'active',
        officeDays: [],
        startDate: null,
        endDate: null,
        equipmentNeeds: [],
        equipmentStatus: 'not-needed',
        photoUrl: null,
        tags: [],
        accommodations: [],
        sensitivityTags,
        pendingStatusChanges: [],
        seatId: null,
        floorId: null,
        leaveType: null,
        expectedReturnDate: null,
        coverageEmployeeId: null,
        leaveNotes: null,
        departureDate: null,
        createdAt: new Date().toISOString(),
      },
    },
  })
}

function openDrawer() {
  const row = screen.getByText('Alice').closest('tr')!
  act(() => {
    fireEvent.doubleClick(row)
  })
}

describe('RosterDetailDrawer — Sensitivity tags section', () => {
  beforeEach(() => {
    seedEmployee()
  })

  it('persists a comma/space-separated list to the store on blur', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    openDrawer()
    const input = screen.getByLabelText('Sensitivity tags') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'audit, legal insider-risk' } })
      fireEvent.blur(input)
    })

    const stored = useEmployeeStore.getState().employees.e1.sensitivityTags
    expect(stored.sort()).toEqual(['audit', 'insider-risk', 'legal'])
  })

  it('renders each tag as a chip with a remove × that clears it', () => {
    seedEmployee(['audit', 'legal'])
    renderAtRoute('/t/acme/o/hq/roster')
    openDrawer()

    expect(screen.getByTestId('sensitivity-tag-chip-audit')).toBeTruthy()
    expect(screen.getByTestId('sensitivity-tag-chip-legal')).toBeTruthy()

    const removeBtn = screen.getByLabelText('Remove sensitivity tag audit')
    act(() => {
      fireEvent.click(removeBtn)
    })
    expect(
      useEmployeeStore.getState().employees.e1.sensitivityTags,
    ).toEqual(['legal'])
  })

  it('disables the input and hides remove buttons for viewers without editRoster', () => {
    seedEmployee(['audit'], 'viewer')
    renderAtRoute('/t/acme/o/hq/roster')
    // Viewer role projects through `redactEmployee`, which collapses
    // full names to initials ("Alice" → "A."). Open the drawer via the
    // redacted label so we don't couple the test to the PII projection.
    const row = screen.getByText('A.').closest('tr')!
    act(() => {
      fireEvent.doubleClick(row)
    })

    const input = screen.getByLabelText('Sensitivity tags') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.queryByLabelText('Remove sensitivity tag audit')).toBeNull()
  })
})
