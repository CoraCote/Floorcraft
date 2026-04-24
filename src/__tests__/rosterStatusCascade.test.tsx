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
 * When a still-seated person is moved to `departed`, the roster opens a
 * follow-up "also unassign their seat?" prompt. Without this cascade the
 * WeeklyCapacity stats silently counted departed folks as occupants.
 *
 * These tests cover both the row `<select>` path and the confirm/cancel
 * branches — the bulk-action bar funnels through the same helper so one
 * row-level cover is enough.
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
  // Seat element lives on f1 so unassignEmployee can clear it cleanly.
  // Workstation shape — `assignedEmployeeIds` must be an array or the
  // clearEmployeeFromElement reducer crashes on `.filter`.
  const seat = {
    id: 'seat1', type: 'workstation', x: 0, y: 0, width: 60, height: 40,
    rotation: 0, assignedEmployeeIds: ['e1'],
  } as any
  useElementsStore.setState({ elements: { seat1: seat } })
  useFloorStore.setState({
    floors: [{
      id: 'f1', name: 'Floor 1', order: 0,
      elements: { seat1: seat },
    }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1', name: 'Seated Sam', email: '', department: null, team: null,
        title: null, managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [],
        seatId: 'seat1', floorId: 'f1', leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
    },
  })
})

function rowStatusSelect(name: string) {
  const row = screen.getByText(name).closest('tr')!
  // The row has exactly one <select> — the status dropdown.
  return row.querySelector('select') as HTMLSelectElement
}

describe('Row Status → departed cascade', () => {
  it('opens the unassign prompt when a seated person is marked departed', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const sel = rowStatusSelect('Seated Sam')
    act(() => { fireEvent.change(sel, { target: { value: 'departed' } }) })
    // Status flip itself went through — dialog is a follow-up, not a block.
    expect(useEmployeeStore.getState().employees.e1.status).toBe('departed')
    // The dialog is up, asking about the seat.
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/unassign their seat\?/i)).toBeTruthy()
  })

  it('confirm unassigns the seat', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const sel = rowStatusSelect('Seated Sam')
    act(() => { fireEvent.change(sel, { target: { value: 'departed' } }) })
    // The confirm button reads "Unassign seat" (singular for one person).
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Unassign seat/i }))
    })
    const after = useEmployeeStore.getState().employees.e1
    expect(after.seatId).toBeNull()
    expect(after.floorId).toBeNull()
    // Dialog closed.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cancel keeps the seat held', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const sel = rowStatusSelect('Seated Sam')
    act(() => { fireEvent.change(sel, { target: { value: 'departed' } }) })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Keep seat/i }))
    })
    const after = useEmployeeStore.getState().employees.e1
    // Status change stuck, seat did not.
    expect(after.status).toBe('departed')
    expect(after.seatId).toBe('seat1')
    expect(after.floorId).toBe('f1')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not open the prompt when the person is already unseated', () => {
    // Strip the seat off before the status flip.
    useEmployeeStore.setState({
      employees: {
        e1: {
          ...useEmployeeStore.getState().employees.e1,
          seatId: null, floorId: null,
        },
      },
    })
    renderAtRoute('/t/acme/o/hq/roster')
    const sel = rowStatusSelect('Seated Sam')
    act(() => { fireEvent.change(sel, { target: { value: 'departed' } }) })
    expect(useEmployeeStore.getState().employees.e1.status).toBe('departed')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
