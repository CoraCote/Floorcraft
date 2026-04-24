/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { OrgChartPage } from '../components/editor/OrgChartPage'

function renderAtRoute(path = '/t/acme/o/hq/org-chart') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/org-chart"
          element={<OrgChartPage />}
        />
        <Route
          path="/t/:teamSlug/o/:officeSlug/roster"
          element={<div data-testid="roster-stub" />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function mkEmployee(over: Partial<any>): any {
  return {
    id: 'x', name: 'X', email: '', department: null, team: null,
    title: null, managerId: null, employmentType: 'full-time',
    status: 'active', officeDays: [], startDate: null, endDate: null,
    leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
    leaveNotes: null, departureDate: null, equipmentNeeds: [],
    equipmentStatus: 'not-needed', photoUrl: null, tags: [],
    accommodations: [], seatId: null, floorId: null,
    pendingStatusChanges: [], createdAt: new Date().toISOString(),
    ...over,
  }
}

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: 'editor', impersonatedRole: null } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      ceo: mkEmployee({ id: 'ceo', name: 'Ceo Person', title: 'CEO', department: 'Exec', managerId: null }),
      vp: mkEmployee({ id: 'vp', name: 'Vp Person', title: 'VP Eng', department: 'Engineering', managerId: 'ceo' }),
      ic: mkEmployee({ id: 'ic', name: 'Ic Person', title: 'Staff Eng', department: 'Engineering', managerId: 'vp' }),
      orphan: mkEmployee({ id: 'orphan', name: 'Orphan Person', title: 'IC', department: 'Design', managerId: null }),
    },
    departmentColors: { Exec: '#111111', Engineering: '#222222', Design: '#333333' },
  })
})

describe('OrgChartPage', () => {
  it('renders a node per employee', () => {
    renderAtRoute()
    expect(screen.getByText('Ceo Person')).toBeTruthy()
    expect(screen.getByText('Vp Person')).toBeTruthy()
    expect(screen.getByText('Ic Person')).toBeTruthy()
    expect(screen.getByText('Orphan Person')).toBeTruthy()
  })

  it('shows the employee title on each card', () => {
    renderAtRoute()
    expect(screen.getByText('CEO')).toBeTruthy()
    expect(screen.getByText('VP Eng')).toBeTruthy()
    expect(screen.getByText('Staff Eng')).toBeTruthy()
  })

  it('shows an Unassigned label when no seat is assigned', () => {
    renderAtRoute()
    // Every seeded employee is seat-unassigned → 4 "Unassigned" labels.
    expect(screen.getAllByText('Unassigned').length).toBe(4)
  })

  it('shows the synthetic seat label when the employee has a seat', () => {
    act(() => {
      useFloorStore.setState({
        floors: [
          {
            id: 'f1', name: 'Floor 1', order: 0,
            elements: {
              seat1: { id: 'seat1', type: 'desk', deskId: 'A-101', x: 0, y: 0, width: 0, height: 0, rotation: 0, locked: false, groupId: null, zIndex: 0, label: '', visible: true, style: { fill: '', stroke: '', strokeWidth: 0, opacity: 1 } } as any,
            },
          },
        ],
        activeFloorId: 'f1',
      } as any)
      useEmployeeStore.setState((s) => ({
        employees: {
          ...s.employees,
          ceo: { ...s.employees.ceo, seatId: 'seat1', floorId: 'f1' },
        },
      }))
    })
    renderAtRoute()
    expect(screen.getByText('A-101')).toBeTruthy()
  })

  it('redacts names for viewer role (PII gate)', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    renderAtRoute()
    // Viewer lacks `viewReports` — but test still matters: render path
    // must not leak names even if this component were ever mounted.
    // Since we gate on viewReports at the route level, the page shows
    // an unauthorized stub.
    expect(screen.getByText(/not authorized/i)).toBeTruthy()
    // And raw PII must not appear.
    expect(screen.queryByText('Ceo Person')).toBeNull()
  })

  it('redacts names for space-planner (can viewReports, lacks viewPII)', () => {
    useProjectStore.setState({ currentOfficeRole: 'space-planner' } as any)
    renderAtRoute()
    // space-planner can see the chart (has viewReports) but the names are
    // redacted to initials because they lack viewPII.
    expect(screen.queryByText('Ceo Person')).toBeNull()
    expect(screen.getByText('C.P.')).toBeTruthy()
    // A manager relationship that was redacted to null means this
    // "employee" will render as an orphan root — that's the correct
    // privacy-preserving behaviour: we can't show who reports to whom
    // to someone who can't see identities.
  })

  it('shows an empty-state message when no reporting data exists', () => {
    // Drop all employees so there's literally nothing to chart.
    act(() => {
      useEmployeeStore.setState({ employees: {} })
    })
    renderAtRoute()
    expect(screen.getByText(/No reporting data/i)).toBeTruthy()
    // The empty-state prompt names the managerId field. We check the
    // surrounding text ("Set … on employees to build…") separately from
    // the <code>managerId</code> span so the test doesn't depend on the
    // exact DOM split.
    expect(screen.getByText(/Set/i)).toBeTruthy()
    expect(screen.getByText('managerId')).toBeTruthy()
    expect(screen.getByText(/on employees to build this chart/i)).toBeTruthy()
  })

  it('renders a cycle banner and refuses to draw when a loop is present', () => {
    act(() => {
      useEmployeeStore.setState({
        employees: {
          a: mkEmployee({ id: 'a', name: 'Alice', managerId: 'b' }),
          b: mkEmployee({ id: 'b', name: 'Bob', managerId: 'a' }),
        },
      })
    })
    renderAtRoute()
    // Banner calls out the cycle.
    expect(screen.getByTestId('org-chart-cycle-banner')).toBeTruthy()
    // And names every member.
    expect(screen.getByTestId('org-chart-cycle-banner').textContent).toMatch(/Alice/)
    expect(screen.getByTestId('org-chart-cycle-banner').textContent).toMatch(/Bob/)
    // A "Fix in roster" button is present for the first cycle member.
    expect(screen.getByRole('button', { name: /Fix in roster/i })).toBeTruthy()
  })

  it('clicking a node navigates to the roster with the employee name as query', () => {
    renderAtRoute()
    const ceoCard = screen.getByTestId('org-node-ceo')
    act(() => { fireEvent.click(ceoCard) })
    // We should have landed on the roster stub.
    expect(screen.getByTestId('roster-stub')).toBeTruthy()
  })

  it('places orphans (managerId → missing employee) at the root level', () => {
    act(() => {
      useEmployeeStore.setState({
        employees: {
          ghost: mkEmployee({ id: 'ghost', name: 'Ghost IC', managerId: 'deleted-manager' }),
        },
      })
    })
    renderAtRoute()
    expect(screen.getByText('Ghost IC')).toBeTruthy()
  })
})
