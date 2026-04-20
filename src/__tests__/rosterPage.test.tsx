/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { RosterPage } from '../components/editor/RosterPage'

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/project/:slug/roster" element={<RosterPage />} />
        <Route path="/project/:slug/map" element={<div>Map page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1', name: 'Alice', email: '', department: 'Engineering', team: null,
        title: 'IC5', managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [],
        seatId: null, floorId: null, createdAt: new Date().toISOString(),
      },
      e2: {
        id: 'e2', name: 'Bob', email: '', department: 'Design', team: null,
        title: 'Manager', managerId: null, employmentType: 'full-time', status: 'on-leave',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [],
        seatId: null, floorId: null, createdAt: new Date().toISOString(),
      },
    },
  })
})

describe('RosterPage', () => {
  it('renders a row per employee from the store', () => {
    renderAtRoute('/project/acme/roster')
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    // Both departments appear as inline cells.
    expect(screen.getByText('Engineering')).toBeTruthy()
    expect(screen.getByText('Design')).toBeTruthy()
  })

  it('commits an inline title edit to the store on blur', () => {
    renderAtRoute('/project/acme/roster')
    // Click the title cell for Alice (initial value "IC5") to enter edit mode.
    const titleCell = screen.getByText('IC5')
    act(() => { fireEvent.click(titleCell) })
    const input = screen.getByDisplayValue('IC5') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'Staff Eng' } })
      fireEvent.blur(input)
    })
    expect(useEmployeeStore.getState().employees.e1.title).toBe('Staff Eng')
  })

  it('changes status through the inline select', () => {
    renderAtRoute('/project/acme/roster')
    // Find all status selects; Alice is first in alphabetic order so her
    // select is at index 0 (header has no select).
    const selects = screen
      .getAllByRole('combobox')
      .filter((el) => (el as HTMLSelectElement).value === 'active' || (el as HTMLSelectElement).value === 'on-leave')
    // The status column should include at least one select with 'active'.
    const aliceStatus = selects.find(
      (el) => (el as HTMLSelectElement).value === 'active',
    ) as HTMLSelectElement
    act(() => {
      fireEvent.change(aliceStatus, { target: { value: 'departed' } })
    })
    expect(useEmployeeStore.getState().employees.e1.status).toBe('departed')
  })

  it('filters by department via the URL-synced dropdown', () => {
    renderAtRoute('/project/acme/roster')
    // Seed departmentColors so the dept dropdown lists both.
    act(() => {
      useEmployeeStore.setState((s) => ({
        departmentColors: { ...s.departmentColors, Engineering: '#000', Design: '#111' },
      }))
    })
    const deptSelect = screen.getByLabelText('Filter by department') as HTMLSelectElement
    act(() => {
      fireEvent.change(deptSelect, { target: { value: 'Engineering' } })
    })
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('renders status counts in the stats bar', () => {
    // Alice is active, Bob is on-leave (set in beforeEach). Both are
    // seat-unassigned, so the "Unassigned" chip should count 2.
    renderAtRoute('/project/acme/roster')
    // `On leave` chip shows the number 1 alongside its label.
    const onLeaveChip = screen.getByRole('button', { name: /1\s+On leave/i })
    expect(onLeaveChip).toBeTruthy()
    // Unassigned chip counts both seed employees.
    const unassignedChip = screen.getByRole('button', { name: /2\s+Unassigned/i })
    expect(unassignedChip).toBeTruthy()
  })

  it('clicking the On-leave stats chip narrows to status=on-leave', () => {
    renderAtRoute('/project/acme/roster')
    const onLeaveChip = screen.getByRole('button', { name: /1\s+On leave/i })
    act(() => { fireEvent.click(onLeaveChip) })
    // After the click the status chip should be toggled on and Alice
    // should disappear from the list.
    expect(screen.queryByText('Alice')).toBeNull()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('shows Clear filters button once a filter is active and resets on click', () => {
    renderAtRoute('/project/acme/roster?status=active')
    // Alice is active, Bob is on-leave → only Alice is visible.
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('Bob')).toBeNull()
    const clear = screen.getByTitle('Clear all filters')
    act(() => { fireEvent.click(clear) })
    // Both rows should be back.
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
  })

  it('double-clicking a row opens the detail drawer', () => {
    renderAtRoute('/project/acme/roster')
    // Double-click on Alice's row. Target a plain cell (the <tr> double-click
    // handler ignores inputs/selects/buttons).
    const row = screen.getByText('Alice').closest('tr')!
    act(() => { fireEvent.doubleClick(row) })
    // Drawer labels itself with the employee name via aria-label.
    expect(screen.getByRole('dialog', { name: /Edit Alice/i })).toBeTruthy()
  })
})
