/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { useScenariosStore } from '../stores/scenariosStore'
import { ScenariosPage } from '../components/editor/reports/ScenariosPage'
import type { Employee } from '../types/employee'

function mkEmployee(over: Partial<Employee>): Employee {
  // Every required field must be present — `tsc -b` will flag missing ones
  // and this fixture is used across several tests that set custom
  // departments / statuses.
  return {
    id: 'x', name: 'X', email: '', department: null, team: null,
    title: null, managerId: null, employmentType: 'full-time',
    status: 'active', officeDays: [], startDate: null, endDate: null,
    leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
    leaveNotes: null, departureDate: null, equipmentNeeds: [],
    equipmentStatus: 'not-needed', photoUrl: null, tags: [],
    accommodations: [], seatId: null, floorId: null,
    pendingStatusChanges: [], sensitivityTags: [], createdAt: new Date().toISOString(),
    ...over,
  }
}

function renderAtRoute() {
  return render(
    <MemoryRouter initialEntries={['/t/acme/o/hq/reports/scenarios']}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/reports/scenarios"
          element={<ScenariosPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: 'editor', impersonatedRole: null } as any)
  useScenariosStore.getState().reset()
  useElementsStore.setState({
    elements: {
      d1: { id: 'd1', type: 'desk', deskId: 'D-1', assignedEmployeeId: 'e1', capacity: 1 } as any,
      d2: { id: 'd2', type: 'desk', deskId: 'D-2', assignedEmployeeId: null, capacity: 1 } as any,
    } as any,
  } as any)
  useFloorStore.setState({
    floors: [
      {
        id: 'f1', name: 'Floor 1', order: 0,
        elements: {
          d1: { id: 'd1', type: 'desk', deskId: 'D-1', assignedEmployeeId: 'e1', capacity: 1 } as any,
          d2: { id: 'd2', type: 'desk', deskId: 'D-2', assignedEmployeeId: null, capacity: 1 } as any,
        },
      },
    ],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: mkEmployee({ id: 'e1', name: 'Alice', department: 'Engineering', status: 'active' }),
      e2: mkEmployee({ id: 'e2', name: 'Bob', department: 'Engineering', status: 'active' }),
      e3: mkEmployee({ id: 'e3', name: 'Carol', department: 'Design', status: 'active' }),
    },
    departmentColors: {},
  } as any)
})

describe('ScenariosPage', () => {
  it('shows an empty state when no scenarios exist', () => {
    renderAtRoute()
    expect(screen.getByText(/Create a scenario to start modelling/i)).toBeTruthy()
  })

  it('creates a new scenario when "+ New" is clicked and shows the default name', () => {
    renderAtRoute()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /New scenario/i }))
    })
    // Default name is "Scenario A".
    expect(screen.getAllByText(/Scenario A/).length).toBeGreaterThan(0)
    // Today snapshot: 3 active, 2 seats.
    expect(screen.getByText(/3 active/)).toBeTruthy()
    expect(screen.getByText(/2 seats/)).toBeTruthy()
  })

  it('adds an add-headcount adjustment and the projection updates', () => {
    renderAtRoute()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /New scenario/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Add adjustment/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Add headcount/i }))
    })
    // A row appeared.
    expect(screen.getByTestId('scenario-adjustment-row')).toBeTruthy()
    // Change the count input to 5 — projection should move from 3 → 8
    // (3 baseline + 1 default + 4 = 5 total added). We just set the count
    // to 5 directly.
    const countInput = screen.getByLabelText('Headcount') as HTMLInputElement
    act(() => {
      fireEvent.change(countInput, { target: { value: '5' } })
    })
    // The "Active employees" metric tile shows 8 (3 + 5).
    const activeTile = screen.getByTestId('metric-active-employees')
    expect(within(activeTile).getByText('8')).toBeTruthy()
    // Delta of +5.
    expect(within(activeTile).getByText('+5')).toBeTruthy()
  })

  it('add-seats adjustment bumps total seats without moving headcount', () => {
    renderAtRoute()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /New scenario/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Add adjustment/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Add seats/i }))
    })
    // Default seed for add-seats is 10 seats → total 2 + 10 = 12.
    const seatsTile = screen.getByTestId('metric-total-seats')
    expect(within(seatsTile).getByText('12')).toBeTruthy()
    expect(within(seatsTile).getByText('+10')).toBeTruthy()
    // Headcount tile unchanged.
    const activeTile = screen.getByTestId('metric-active-employees')
    expect(within(activeTile).getByText('3')).toBeTruthy()
  })

  it('× button removes an adjustment', () => {
    renderAtRoute()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /New scenario/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Add adjustment/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Add seats/i }))
    })
    expect(screen.getByTestId('scenario-adjustment-row')).toBeTruthy()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Remove adjustment/i }))
    })
    expect(screen.queryByTestId('scenario-adjustment-row')).toBeNull()
  })

  it('space-planner role can view but every input is read-only', () => {
    useProjectStore.setState({ currentOfficeRole: 'space-planner' } as any)
    // Seed a scenario directly in the store so space-planner has something
    // to look at (they lack editRoster so the "+ New" button would be
    // hidden otherwise).
    act(() => {
      useScenariosStore.getState().createScenario({
        activeEmployees: 3,
        employeesByDepartment: { Engineering: 2, Design: 1 },
        totalSeats: 2,
        assignedSeats: 1,
      }, 'Read-only scenario')
      useScenariosStore.getState().addAdjustment(
        useScenariosStore.getState().scenarios[0].id,
        { type: 'add-headcount', department: 'Engineering', count: 3 },
      )
    })
    renderAtRoute()
    // Name field is disabled (readonly) for a space-planner.
    const nameInput = screen.getByLabelText('Scenario name') as HTMLInputElement
    expect(nameInput.disabled).toBe(true)
    // Projection still renders.
    const activeTile = screen.getByTestId('metric-active-employees')
    expect(within(activeTile).getByText('6')).toBeTruthy()
    // "+ New" is hidden because editRoster is gone.
    expect(screen.queryByRole('button', { name: /New scenario/i })).toBeNull()
  })

  it('viewer role sees an unauthorized stub (no viewReports)', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    renderAtRoute()
    expect(screen.getByText(/Not authorized to view scenarios/i)).toBeTruthy()
  })

  it('does not leak employee names into the scenarios UI', () => {
    renderAtRoute()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /New scenario/i }))
    })
    // The fixture seeds employees named Alice, Bob, Carol — none of them
    // should ever appear on the scenarios surface since scenarios deal in
    // counts, not identities.
    expect(screen.queryByText(/Alice/)).toBeNull()
    expect(screen.queryByText(/Bob/)).toBeNull()
    expect(screen.queryByText(/Carol/)).toBeNull()
  })

  it('clone scenario creates a second entry in the sidebar', () => {
    renderAtRoute()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /New scenario/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Clone scenario/i }))
    })
    // Sidebar now lists Scenario A + Scenario A (copy).
    expect(screen.getAllByText(/Scenario A/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/Scenario A \(copy\)/)).toBeTruthy()
  })
})
