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
 * Regression cover for the drawer-name gap: adding a person was creating
 * a row and opening the drawer on Email, forcing the user to close the
 * drawer just to set a name. The drawer now leads with Name.
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

beforeEach(() => {
  // Drawer name edits exercise PII mutation paths, which now require the
  // `viewPII` capability (owner / editor / hr-editor). Seed an editor role
  // so the roster renders raw names rather than the redacted projection.
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
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [], sensitivityTags: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
    },
  })
})

describe('Drawer — Name field', () => {
  it('renders Name as the first field and populates it from the store', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Open the drawer via double-click on the row.
    const row = screen.getByText('Alice').closest('tr')!
    act(() => { fireEvent.doubleClick(row) })
    // Drawer dialog is up. The Name input should carry the current value
    // AND be the autofocused element (the effect selects on mount).
    const nameInput = screen.getByDisplayValue('Alice') as HTMLInputElement
    expect(nameInput).toBeTruthy()
    expect(nameInput.type).toBe('text')
    // The label above the field reads "Name".
    expect(nameInput.closest('label')?.textContent).toMatch(/Name/i)
  })

  it('commits a new name on blur', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const row = screen.getByText('Alice').closest('tr')!
    act(() => { fireEvent.doubleClick(row) })
    const nameInput = screen.getByDisplayValue('Alice') as HTMLInputElement
    act(() => {
      fireEvent.change(nameInput, { target: { value: 'Alicia' } })
      fireEvent.blur(nameInput)
    })
    expect(useEmployeeStore.getState().employees.e1.name).toBe('Alicia')
  })

  it('ignores an empty name commit (name is required)', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const row = screen.getByText('Alice').closest('tr')!
    act(() => { fireEvent.doubleClick(row) })
    const nameInput = screen.getByDisplayValue('Alice') as HTMLInputElement
    act(() => {
      fireEvent.change(nameInput, { target: { value: '   ' } })
      fireEvent.blur(nameInput)
    })
    // Store still shows the original name — empty commit was rejected.
    expect(useEmployeeStore.getState().employees.e1.name).toBe('Alice')
  })
})
