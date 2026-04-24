/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { RosterPage } from '../components/editor/RosterPage'

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

function makeEmployee(id: string, overrides: Partial<any> = {}): any {
  return {
    id,
    name: id.toUpperCase(),
    email: '',
    department: null,
    team: null,
    title: null,
    managerId: null,
    employmentType: 'full-time',
    status: 'active',
    officeDays: [],
    startDate: null,
    endDate: null,
    leaveType: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    departureDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: null,
    tags: [],
    seatId: null,
    floorId: null,
    pendingStatusChanges: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  // Freeze time so "today" in the UI matches what the assertions pick
  // — Jun 15 2025 local. The commit-on-load tick runs inside the
  // component; with a fixed clock it's a no-op for the fixtures below.
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0))

  useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      alice: makeEmployee('alice'),
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RosterDetailDrawer — scheduled status changes', () => {
  it('adds a scheduled change that appears in the list and on the employee', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const row = screen.getByText('ALICE').closest('tr')!
    act(() => { fireEvent.doubleClick(row) })

    const dateInput = screen.getByLabelText('Effective date') as HTMLInputElement
    const statusSelect = screen.getByLabelText('New status') as HTMLSelectElement
    const noteInput = screen.getByLabelText('Note') as HTMLInputElement
    const scheduleBtn = screen.getByRole('button', { name: /^Schedule$/ })

    act(() => {
      fireEvent.change(dateInput, { target: { value: '2025-07-01' } })
      fireEvent.change(statusSelect, { target: { value: 'on-leave' } })
      fireEvent.change(noteInput, { target: { value: 'parental' } })
    })
    act(() => { fireEvent.click(scheduleBtn) })

    const changes = useEmployeeStore.getState().employees.alice.pendingStatusChanges
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      status: 'on-leave',
      effectiveDate: '2025-07-01',
      note: 'parental',
    })
    // Visible in the list (the bracketed date is unique to the list row).
    expect(screen.getByText(/\[2025-07-01\]/)).toBeTruthy()
    // The note is rendered inside parens — unique to the list entry and
    // distinct from the "parental-leave" status option in the select.
    expect(screen.getByText(/\(parental\)/)).toBeTruthy()
  })

  it('removes a scheduled change when the trash button is clicked', () => {
    useEmployeeStore.setState({
      employees: {
        alice: makeEmployee('alice', {
          pendingStatusChanges: [
            {
              id: 'c1',
              status: 'on-leave',
              effectiveDate: '2025-07-01',
              note: null,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      },
    })
    renderAtRoute('/t/acme/o/hq/roster')
    const row = screen.getByText('ALICE').closest('tr')!
    act(() => { fireEvent.doubleClick(row) })

    const removeBtn = screen.getByLabelText(
      'Remove scheduled change for 2025-07-01',
    )
    act(() => { fireEvent.click(removeBtn) })

    expect(
      useEmployeeStore.getState().employees.alice.pendingStatusChanges,
    ).toHaveLength(0)
  })

  it('rejects past dates (Schedule button disabled, helper text visible)', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const row = screen.getByText('ALICE').closest('tr')!
    act(() => { fireEvent.doubleClick(row) })

    const dateInput = screen.getByLabelText('Effective date') as HTMLInputElement
    act(() => {
      fireEvent.change(dateInput, { target: { value: '2025-01-01' } })
    })

    const scheduleBtn = screen.getByRole('button', { name: /^Schedule$/ }) as HTMLButtonElement
    expect(scheduleBtn.disabled).toBe(true)
    expect(screen.getByText(/today or a future date/i)).toBeTruthy()

    // Clicking still does nothing — belt-and-braces.
    act(() => { fireEvent.click(scheduleBtn) })
    expect(
      useEmployeeStore.getState().employees.alice.pendingStatusChanges,
    ).toHaveLength(0)
  })
})
