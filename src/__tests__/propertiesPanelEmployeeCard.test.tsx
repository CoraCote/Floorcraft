/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PropertiesPanel } from '../components/editor/RightSidebar/PropertiesPanel'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import type { DeskElement } from '../types/elements'
import type { Employee } from '../types/employee'

/**
 * Test harness that wraps PropertiesPanel in a MemoryRouter so the
 * "View profile" action's `useNavigate()` works. The route captures the
 * `teamSlug` + `officeSlug` params the card reads via `useParams`.
 */
function renderPanel(initialPath = '/t/acme/o/hq/map') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/*"
          element={<PropertiesPanel />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function makeEmployee(overrides: Partial<Employee>): Employee {
  return {
    id: overrides.id!,
    name: overrides.name!,
    email: overrides.email ?? `${overrides.id!}@example.com`,
    department: overrides.department ?? 'Engineering',
    team: overrides.team ?? 'Platform',
    title: overrides.title ?? 'Staff Engineer',
    managerId: overrides.managerId ?? null,
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
    accommodations: [],
    sensitivityTags: [],
    seatId: overrides.seatId ?? null,
    floorId: overrides.floorId ?? null,
    pendingStatusChanges: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Employee
}

function makeDesk(id: string, assignedEmployeeId: string | null): DeskElement {
  return {
    id,
    type: 'desk',
    x: 100,
    y: 100,
    width: 60,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: id,
    assignedEmployeeId,
    capacity: 1,
  } as DeskElement
}

beforeEach(() => {
  cleanup()
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {} })
  useUIStore.setState({ selectedIds: [] } as any)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  // Editor role has viewPII + editRoster + editMap.
  useProjectStore.setState({
    currentOfficeRole: 'editor',
    impersonatedRole: null,
  } as any)
})

describe('PropertiesPanel employee detail card', () => {
  it('does not render an employee card for a desk with no assignee', () => {
    useElementsStore.setState({ elements: { d1: makeDesk('d1', null) } })
    useUIStore.setState({ selectedIds: ['d1'] } as any)
    renderPanel()

    expect(screen.queryByTestId('employee-detail-card')).toBeNull()
    // Regular desk properties still render.
    expect(screen.getByText(/No one assigned/i)).toBeInTheDocument()
  })

  it('renders the employee card for a desk with an assignee', () => {
    useElementsStore.setState({ elements: { d1: makeDesk('d1', 'e1') } })
    useEmployeeStore.setState({
      employees: {
        e1: makeEmployee({
          id: 'e1',
          name: 'Alice Smith',
          title: 'Principal PM',
          department: 'Product',
          team: 'Growth',
          email: 'alice@example.com',
        }),
      },
    })
    useUIStore.setState({ selectedIds: ['d1'] } as any)
    renderPanel()

    expect(screen.getByTestId('employee-detail-card')).toBeInTheDocument()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getByTestId('status-chip').textContent).toBe('Active')
    expect(
      screen.getByTestId('employee-detail-unassign'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('employee-detail-view-profile'),
    ).toBeInTheDocument()
  })

  it('clicking Unassign calls unassignEmployee; selection stays on the desk', () => {
    useElementsStore.setState({ elements: { d1: makeDesk('d1', 'e1') } })
    useEmployeeStore.setState({
      employees: {
        e1: {
          ...makeEmployee({ id: 'e1', name: 'Alice' }),
          seatId: 'd1',
          floorId: 'f1',
        },
      },
    })
    useFloorStore.setState({
      floors: [
        { id: 'f1', name: 'F', order: 0, elements: { d1: makeDesk('d1', 'e1') } },
      ],
      activeFloorId: 'f1',
    } as any)
    useUIStore.setState({ selectedIds: ['d1'] } as any)
    renderPanel()

    fireEvent.click(screen.getByTestId('employee-detail-unassign'))

    expect(useEmployeeStore.getState().employees['e1'].seatId).toBeNull()
    // Selection stays on the desk (sidebar version doesn't clear it).
    expect(useUIStore.getState().selectedIds).toEqual(['d1'])
  })

  it('redacts email and manager when viewPII is false', () => {
    // Viewer role has viewMap but not viewPII.
    useProjectStore.setState({
      currentOfficeRole: 'viewer',
      impersonatedRole: null,
    } as any)
    useElementsStore.setState({ elements: { d1: makeDesk('d1', 'e1') } })
    useEmployeeStore.setState({
      employees: {
        e1: makeEmployee({
          id: 'e1',
          name: 'Alice Smith',
          email: 'alice@example.com',
          managerId: 'mgr',
        }),
        mgr: makeEmployee({ id: 'mgr', name: 'Boss Person' }),
      },
    })
    useUIStore.setState({ selectedIds: ['d1'] } as any)
    renderPanel()

    // Raw email is redacted out of the card.
    expect(screen.queryByText('alice@example.com')).toBeNull()
    // Manager name is redacted too.
    expect(screen.queryByText('Boss Person')).toBeNull()
    // Explicit "— (redacted)" placeholders render for both rows.
    expect(screen.getAllByText(/— \(redacted\)/i).length).toBeGreaterThanOrEqual(2)
  })
})
