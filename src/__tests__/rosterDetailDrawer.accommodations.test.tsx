/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { RosterPage } from '../components/editor/RosterPage'
import type { Accommodation } from '../types/employee'

/**
 * Exercises the Accommodations section of `RosterDetailDrawer`:
 *   - Add form appends a new entry to `employee.accommodations`.
 *   - The per-chip × button removes the corresponding entry.
 * Mirrors the route + store-seeding pattern in `rosterDrawerName.test.tsx`.
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

function seedEmployee(accommodations: Accommodation[] = []) {
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
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [],
        accommodations,
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        createdAt: new Date().toISOString(),
      },
    },
  })
}

function openDrawer() {
  const row = screen.getByText('Alice').closest('tr')!
  act(() => { fireEvent.doubleClick(row) })
}

describe('RosterDetailDrawer — Accommodations section', () => {
  beforeEach(() => {
    seedEmployee()
  })

  it('adds an accommodation on clicking Add', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    openDrawer()
    const select = screen.getByLabelText('Accommodation type') as HTMLSelectElement
    const notes = screen.getByLabelText('Accommodation notes') as HTMLInputElement
    const addBtn = screen.getByRole('button', { name: 'Add' })

    act(() => {
      fireEvent.change(select, { target: { value: 'wheelchair-access' } })
      fireEvent.change(notes, { target: { value: 'Ground floor only' } })
      fireEvent.click(addBtn)
    })

    const stored = useEmployeeStore.getState().employees.e1.accommodations
    expect(stored).toHaveLength(1)
    expect(stored[0].type).toBe('wheelchair-access')
    expect(stored[0].notes).toBe('Ground floor only')
    expect(stored[0].id).toBeTruthy()
  })

  it('removes an accommodation via the × button', () => {
    seedEmployee([
      {
        id: 'a1',
        type: 'quiet-zone',
        notes: null,
        createdAt: new Date().toISOString(),
      },
    ])
    renderAtRoute('/t/acme/o/hq/roster')
    openDrawer()

    expect(useEmployeeStore.getState().employees.e1.accommodations).toHaveLength(1)
    const removeBtn = screen.getByLabelText('Remove Quiet zone')
    act(() => { fireEvent.click(removeBtn) })
    expect(useEmployeeStore.getState().employees.e1.accommodations).toEqual([])
  })

  it('Add button is disabled until a type is selected', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    openDrawer()
    const addBtn = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement
    expect(addBtn.disabled).toBe(true)
    const select = screen.getByLabelText('Accommodation type') as HTMLSelectElement
    act(() => { fireEvent.change(select, { target: { value: 'standing-desk' } }) })
    expect(addBtn.disabled).toBe(false)
  })
})
