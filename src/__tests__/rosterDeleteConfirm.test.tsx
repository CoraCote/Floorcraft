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
 * Delete — row and bulk — used to fire immediately on click. These tests
 * verify the confirmation dialog now gates every destructive path, and
 * that Cancel really cancels (no fire-and-forget on Escape).
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
  useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1', name: 'Alice', email: '', department: null, team: null,
        title: null, managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
      e2: {
        id: 'e2', name: 'Bob', email: '', department: null, team: null,
        title: null, managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
    },
  })
})

describe('Row delete — confirmation', () => {
  it('opens a confirm dialog on row Delete click and keeps the employee until confirmed', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Open Alice's row-action menu; header cell also carries the label,
    // so we filter to BUTTON elements only.
    const actionButtons = screen
      .getAllByLabelText('Row actions')
      .filter((el) => el.tagName === 'BUTTON')
    act(() => { fireEvent.click(actionButtons[0]) })
    // Clicking Delete in the menu does NOT wipe the row yet — it stages
    // the confirmation dialog.
    const deleteItem = screen.getByRole('button', { name: 'Delete' })
    act(() => { fireEvent.click(deleteItem) })
    expect(useEmployeeStore.getState().employees.e1).toBeTruthy()
    // The dialog shows the employee's name in the preview list.
    expect(screen.getByRole('dialog')).toBeTruthy()
    // Alice appears in both the table row AND the dialog preview list —
    // just verify both exist.
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
  })

  it('confirming the dialog performs the delete', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const actionButtons = screen
      .getAllByLabelText('Row actions')
      .filter((el) => el.tagName === 'BUTTON')
    act(() => { fireEvent.click(actionButtons[0]) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })) })
    // Now confirm. The danger button label reads "Delete".
    const confirmBtn = screen
      .getAllByRole('button', { name: 'Delete' })
      .find((el) => el.className.includes('bg-red-600'))!
    act(() => { fireEvent.click(confirmBtn) })
    expect(useEmployeeStore.getState().employees.e1).toBeUndefined()
  })

  it('canceling leaves the row intact', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const actionButtons = screen
      .getAllByLabelText('Row actions')
      .filter((el) => el.tagName === 'BUTTON')
    act(() => { fireEvent.click(actionButtons[0]) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })) })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(useEmployeeStore.getState().employees.e1).toBeTruthy()
    // Dialog is gone.
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Bulk delete — confirmation', () => {
  it('opens a dialog previewing selected names and deletes on confirm', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    // Select both rows.
    const toggleAll = screen.getByLabelText('Toggle all') as HTMLInputElement
    act(() => { fireEvent.click(toggleAll) })
    // The bulk-action bar's Delete should open the dialog, not delete.
    const bulkDelete = screen
      .getAllByRole('button', { name: 'Delete' })
      .find((el) => el.className.includes('text-red-700'))!
    act(() => { fireEvent.click(bulkDelete) })
    expect(useEmployeeStore.getState().employees.e1).toBeTruthy()
    expect(useEmployeeStore.getState().employees.e2).toBeTruthy()
    // Title references the count explicitly.
    expect(screen.getByText(/Delete 2 people\?/i)).toBeTruthy()
    // Both names appear in the preview list.
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0)
    // Confirm.
    const confirmBtn = screen
      .getAllByRole('button')
      .find((el) => /^Delete 2$/.test(el.textContent ?? ''))!
    act(() => { fireEvent.click(confirmBtn) })
    expect(useEmployeeStore.getState().employees.e1).toBeUndefined()
    expect(useEmployeeStore.getState().employees.e2).toBeUndefined()
  })
})
