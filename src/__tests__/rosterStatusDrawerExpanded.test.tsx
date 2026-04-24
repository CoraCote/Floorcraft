/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { useToastStore } from '../stores/toastStore'
import { RosterPage } from '../components/editor/RosterPage'
import { EMPLOYEE_STATUSES } from '../types/employee'

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
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useToastStore.setState({ items: [] })
  useEmployeeStore.setState({
    employees: {
      alice: makeEmployee('alice'),
      bob: makeEmployee('bob', { managerId: 'alice' }),
    },
  })
})

describe('RosterDetailDrawer — expanded status set', () => {
  it('drawer Status select renders all 7 statuses', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    const row = screen.getByText('ALICE').closest('tr')!
    act(() => {
      fireEvent.doubleClick(row)
    })
    // The drawer's Status select is the one whose <option> list matches
    // EMPLOYEE_STATUSES. Find it by finding a select that contains every
    // status value — more robust than relying on positional ordering.
    const selects = Array.from(
      document.querySelectorAll('select'),
    ) as HTMLSelectElement[]
    const statusSelect = selects.find((sel) => {
      const values = Array.from(sel.options).map((o) => o.value)
      return EMPLOYEE_STATUSES.every((s) => values.includes(s))
    })
    expect(statusSelect).toBeTruthy()
    // Sanity-check the new additions specifically, so a future removal is
    // loud (not "somewhere the list lost one entry").
    const optionValues = Array.from(statusSelect!.options).map((o) => o.value)
    expect(optionValues).toEqual(expect.arrayContaining([
      'parental-leave',
      'sabbatical',
      'contractor',
      'intern',
    ]))
  })
})

describe('RosterDetailDrawer — manager cycle detection', () => {
  it('blocks a write that would create a 2-node cycle and surfaces a toast', () => {
    // Bob already reports to Alice. If we open Alice's drawer and try to
    // set her manager to Bob, that closes the loop.
    renderAtRoute('/t/acme/o/hq/roster')
    const row = screen.getByText('ALICE').closest('tr')!
    act(() => {
      fireEvent.doubleClick(row)
    })
    // The drawer has the Manager select — find the one whose options list
    // includes the candidate id.
    const selects = Array.from(
      document.querySelectorAll('select'),
    ) as HTMLSelectElement[]
    const managerSelect = selects.find((sel) => {
      const values = Array.from(sel.options).map((o) => o.value)
      return values.includes('bob') && values.includes('')
    })
    expect(managerSelect).toBeTruthy()

    act(() => {
      fireEvent.change(managerSelect!, { target: { value: 'bob' } })
    })

    // Write was blocked — Alice still has no manager.
    expect(useEmployeeStore.getState().employees.alice.managerId).toBeNull()
    // And a toast was pushed.
    const toasts = useToastStore.getState().items
    expect(toasts.length).toBeGreaterThan(0)
    expect(toasts[toasts.length - 1].title).toMatch(/management loop/i)
  })

  it('allows a cycle-free manager write', () => {
    // Fresh setup: Alice has no manager and Bob exists as a potential
    // manager candidate. Assigning Bob to Alice is safe iff Bob does not
    // already (transitively) report to Alice — here Bob DOES report to
    // Alice (via seed), so this write would close a loop. Reset the
    // relationships so the candidate write is safe.
    useEmployeeStore.setState({
      employees: {
        alice: makeEmployee('alice'),
        bob: makeEmployee('bob'),
        carol: makeEmployee('carol'),
      },
    })
    renderAtRoute('/t/acme/o/hq/roster')
    const row = screen.getByText('ALICE').closest('tr')!
    act(() => {
      fireEvent.doubleClick(row)
    })
    const selects = Array.from(
      document.querySelectorAll('select'),
    ) as HTMLSelectElement[]
    const managerSelect = selects.find((sel) => {
      const values = Array.from(sel.options).map((o) => o.value)
      return values.includes('bob') && values.includes('carol') && values.includes('')
    })
    expect(managerSelect).toBeTruthy()
    act(() => {
      fireEvent.change(managerSelect!, { target: { value: 'bob' } })
    })
    expect(useEmployeeStore.getState().employees.alice.managerId).toBe('bob')
  })
})
