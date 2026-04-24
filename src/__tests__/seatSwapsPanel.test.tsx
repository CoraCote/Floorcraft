/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SeatSwapsPanel } from '../components/editor/RightSidebar/SeatSwapsPanel'
import { useSeatSwapsStore } from '../stores/seatSwapsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'
import type { DeskElement, BaseElement } from '../types/elements'

function makeEmployee(
  id: string,
  over: Partial<Employee> = {},
): Employee {
  return {
    id,
    name: `Person ${id}`,
    email: `${id}@example.com`,
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
    accommodations: [],
    sensitivityTags: [],
    seatId: null,
    floorId: null,
    pendingStatusChanges: [],
    createdAt: new Date().toISOString(),
    ...over,
  }
}

function makeDesk(id: string, assigned: string | null = null): DeskElement {
  const base: BaseElement = {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  } as BaseElement
  return {
    ...base,
    type: 'desk',
    deskId: `D-${id}`,
    assignedEmployeeId: assigned,
    capacity: 1,
  } as DeskElement
}

beforeEach(() => {
  useSeatSwapsStore.setState({ requests: {} })
  useEmployeeStore.setState({
    employees: {
      a: makeEmployee('a', { name: 'Alice', seatId: 'd1', floorId: 'f1' }),
      b: makeEmployee('b', { name: 'Bob', seatId: 'd2', floorId: 'f1' }),
    },
  })
  useElementsStore.setState({
    elements: { d1: makeDesk('d1', 'a'), d2: makeDesk('d2', 'b') },
  })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  })
  // Default: viewer is the admin with editRoster.
  useProjectStore.setState({
    currentUserId: 'admin-1',
    currentOfficeRole: 'owner',
    impersonatedRole: null,
  })
})

describe('SeatSwapsPanel', () => {
  it('renders the empty state when there are no requests', () => {
    render(<SeatSwapsPanel />)
    expect(screen.getByText(/No swap requests yet/i)).toBeInTheDocument()
  })

  it('lists pending requests with both employee names', () => {
    useSeatSwapsStore.getState().create('a', 'b', 'closer to team')
    render(<SeatSwapsPanel />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText(/closer to team/)).toBeInTheDocument()
    expect(screen.getByText(/Pending/)).toBeInTheDocument()
  })

  it('approve button is gated on editRoster', () => {
    // Viewer has no editRoster — approve button should not render.
    useProjectStore.setState({ currentOfficeRole: 'viewer' })
    useSeatSwapsStore.getState().create('a', 'b', '')
    render(<SeatSwapsPanel />)
    expect(screen.queryByRole('button', { name: /Approve swap/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Deny swap/i })).toBeNull()
  })

  it('clicking Approve dispatches approve() and swaps seats', () => {
    const res = useSeatSwapsStore.getState().create('a', 'b', '')
    if (!res.ok) throw new Error('create failed')
    render(<SeatSwapsPanel />)
    const btn = screen.getByRole('button', { name: /Approve swap/i })
    fireEvent.click(btn)

    const req = useSeatSwapsStore.getState().requests[res.id]
    expect(req.status).toBe('approved')
    const employees = useEmployeeStore.getState().employees
    expect(employees['a'].seatId).toBe('d2')
    expect(employees['b'].seatId).toBe('d1')
  })

  it('clicking Deny marks the request denied without swapping seats', () => {
    const res = useSeatSwapsStore.getState().create('a', 'b', '')
    if (!res.ok) throw new Error('create failed')
    render(<SeatSwapsPanel />)
    const btn = screen.getByRole('button', { name: /Deny swap/i })
    fireEvent.click(btn)

    const req = useSeatSwapsStore.getState().requests[res.id]
    expect(req.status).toBe('denied')
    const employees = useEmployeeStore.getState().employees
    expect(employees['a'].seatId).toBe('d1')
    expect(employees['b'].seatId).toBe('d2')
  })

  it('renders resolved requests grouped under Approved / Denied headings', () => {
    const res = useSeatSwapsStore.getState().create('a', 'b', 'history')
    if (!res.ok) throw new Error('create failed')
    useSeatSwapsStore.getState().approve(res.id, 'admin-1')
    render(<SeatSwapsPanel />)
    expect(screen.getByText(/Approved/)).toBeInTheDocument()
  })
})
