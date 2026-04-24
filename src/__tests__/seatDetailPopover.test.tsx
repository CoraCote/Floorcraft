/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useRef } from 'react'
import { SeatDetailPopover } from '../components/editor/Canvas/SeatDetailPopover'
import { useSeatDetailStore } from '../stores/seatDragStore'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useProjectStore } from '../stores/projectStore'
import { useFloorStore } from '../stores/floorStore'
import type { DeskElement } from '../types/elements'
import type { Employee } from '../types/employee'

/**
 * Test harness — a wrapper that renders `SeatDetailPopover` with a
 * containerRef (same pattern CanvasStage uses), all inside a
 * MemoryRouter so the `View profile` action's `navigate()` doesn't
 * throw. The `onNavigate` spy is wired through a wildcard route so we
 * can assert the navigation target without mounting the real roster
 * page.
 */
function Harness({ onNavigate }: { onNavigate: (path: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref}>
      <SeatDetailPopover containerRef={ref} />
      <Routes>
        <Route
          path="*"
          element={
            <NavigateProbe onNavigate={onNavigate} />
          }
        />
      </Routes>
    </div>
  )
}

function NavigateProbe({ onNavigate }: { onNavigate: (path: string) => void }) {
  // react-router-dom v6 doesn't expose the current location via a ref
  // — we probe via a component that reports on every render. The test
  // only cares about the last reported path.
  const loc = useLocation()
  onNavigate(loc.pathname + loc.search)
  return null
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

function renderHarness(initialPath = '/t/acme/o/hq/map') {
  const navigateSpy = vi.fn()
  const utils = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/*"
          element={<Harness onNavigate={navigateSpy} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  return { navigateSpy, ...utils }
}

beforeEach(() => {
  cleanup()
  useSeatDetailStore.setState({ activeElementId: null, screenX: 0, screenY: 0 })
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  })
  // Editor role has viewPII + editRoster by default.
  useProjectStore.setState({
    currentOfficeRole: 'editor',
    impersonatedRole: null,
  } as any)
})

describe('SeatDetailPopover', () => {
  it('renders nothing when no active seat is set', () => {
    renderHarness()
    expect(screen.queryByTestId('seat-detail-popover')).toBeNull()
  })

  it('renders employee info when an assigned desk is active', () => {
    useElementsStore.setState({
      elements: { d1: makeDesk('d1', 'e1') },
    })
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
    useSeatDetailStore.getState().open('d1', 120, 200)

    renderHarness()
    expect(screen.getByTestId('seat-detail-popover')).toBeTruthy()
    expect(screen.getByText('Alice Smith')).toBeTruthy()
    expect(screen.getByText('Principal PM')).toBeTruthy()
    expect(screen.getByText('Product')).toBeTruthy()
    expect(screen.getByText('Growth')).toBeTruthy()
    expect(screen.getByText('alice@example.com')).toBeTruthy()
    expect(screen.getByTestId('status-chip').textContent).toBe('Active')
  })

  it('does not render on an empty desk (no assigned employee)', () => {
    useElementsStore.setState({ elements: { d1: makeDesk('d1', null) } })
    useSeatDetailStore.getState().open('d1', 0, 0)
    renderHarness()
    expect(screen.queryByTestId('seat-detail-popover')).toBeNull()
  })

  it('clicking Unassign calls unassignEmployee and closes', async () => {
    useElementsStore.setState({
      elements: { d1: makeDesk('d1', 'e1') },
    })
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
      floors: [{ id: 'f1', name: 'F', order: 0, elements: { d1: makeDesk('d1', 'e1') } }],
      activeFloorId: 'f1',
    })
    useSeatDetailStore.getState().open('d1', 0, 0)
    renderHarness()

    const btn = screen.getByTestId('seat-detail-unassign')
    fireEvent.click(btn)

    expect(useEmployeeStore.getState().employees['e1'].seatId).toBeNull()
    expect(useSeatDetailStore.getState().activeElementId).toBeNull()
  })

  it('View profile navigates to the roster with a focus query', async () => {
    useElementsStore.setState({ elements: { d1: makeDesk('d1', 'e1') } })
    useEmployeeStore.setState({
      employees: { e1: makeEmployee({ id: 'e1', name: 'Alice' }) },
    })
    useSeatDetailStore.getState().open('d1', 0, 0)
    const { navigateSpy } = renderHarness('/t/acme/o/hq/map')

    fireEvent.click(screen.getByTestId('seat-detail-view-profile'))
    // The last reported location should carry the roster path + focus query.
    const last = navigateSpy.mock.calls.at(-1)?.[0] as string
    expect(last).toBe('/t/acme/o/hq/roster?focus=e1')
  })

  it('redacts email and manager when viewPII is false', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
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
    useSeatDetailStore.getState().open('d1', 0, 0)
    renderHarness()

    // Email row shows redacted placeholder; the raw email is not in the DOM.
    expect(screen.queryByText('alice@example.com')).toBeNull()
    // The manager name is gone too — redactEmployee nulls managerId, and
    // we explicitly label redacted fields in the popover.
    expect(screen.queryByText('Boss Person')).toBeNull()
    expect(screen.getAllByText(/— \(redacted\)/i).length).toBeGreaterThan(0)
  })
})
