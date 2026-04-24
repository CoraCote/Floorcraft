/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { useSeatSwapsStore } from '../stores/seatSwapsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import type { DeskElement, BaseElement } from '../types/elements'
import type { Employee } from '../types/employee'

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

function makeBase(id: string, over: Partial<BaseElement> = {}): BaseElement {
  return {
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
    ...over,
  } as BaseElement
}

function makeDesk(id: string, assigned: string | null = null): DeskElement {
  return {
    ...makeBase(id, { type: 'desk' }),
    type: 'desk',
    deskId: `D-${id}`,
    assignedEmployeeId: assigned,
    capacity: 1,
  } as DeskElement
}

beforeEach(() => {
  useSeatSwapsStore.setState({ requests: {} })
  useEmployeeStore.setState({ employees: {} })
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  })
})

function seedTwoSeatedEmployees() {
  // Two seated employees on the same floor: A on d1, B on d2. Uses the
  // live seatAssignment helpers so both sides (employee & element) stay
  // in sync — the approve() path reads element state via assignEmployee.
  useElementsStore.setState({
    elements: {
      d1: makeDesk('d1', 'a'),
      d2: makeDesk('d2', 'b'),
    },
  })
  useEmployeeStore.setState({
    employees: {
      a: makeEmployee('a', { name: 'Alice', seatId: 'd1', floorId: 'f1' }),
      b: makeEmployee('b', { name: 'Bob', seatId: 'd2', floorId: 'f1' }),
    },
  })
}

describe('useSeatSwapsStore', () => {
  it('create() stores a pending request with captured seat ids', () => {
    seedTwoSeatedEmployees()
    const res = useSeatSwapsStore.getState().create('a', 'b', 'want a window seat')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const req = useSeatSwapsStore.getState().requests[res.id]
    expect(req).toMatchObject({
      requesterId: 'a',
      targetEmployeeId: 'b',
      requesterSeatId: 'd1',
      targetSeatId: 'd2',
      status: 'pending',
      reason: 'want a window seat',
      resolvedAt: null,
      resolvedBy: null,
    })
  })

  it('create() rejects when the target is unassigned', () => {
    useEmployeeStore.setState({
      employees: {
        a: makeEmployee('a', { seatId: 'd1', floorId: 'f1' }),
        b: makeEmployee('b'), // no seat
      },
    })
    useElementsStore.setState({ elements: { d1: makeDesk('d1', 'a') } })
    const res = useSeatSwapsStore.getState().create('a', 'b', '')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('target-unseated')
    expect(Object.keys(useSeatSwapsStore.getState().requests)).toHaveLength(0)
  })

  it('create() rejects when the requester is unassigned', () => {
    useEmployeeStore.setState({
      employees: {
        a: makeEmployee('a'), // no seat
        b: makeEmployee('b', { seatId: 'd2', floorId: 'f1' }),
      },
    })
    useElementsStore.setState({ elements: { d2: makeDesk('d2', 'b') } })
    const res = useSeatSwapsStore.getState().create('a', 'b', '')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('requester-unseated')
  })

  it('create() rejects when target employee does not exist', () => {
    useEmployeeStore.setState({
      employees: {
        a: makeEmployee('a', { seatId: 'd1', floorId: 'f1' }),
      },
    })
    const res = useSeatSwapsStore.getState().create('a', 'ghost', '')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('target-not-found')
  })

  it('approve() swaps the two employees seats atomically', () => {
    seedTwoSeatedEmployees()
    const res = useSeatSwapsStore.getState().create('a', 'b', 'swap please')
    expect(res.ok).toBe(true)
    if (!res.ok) return

    useSeatSwapsStore.getState().approve(res.id, 'admin-1')

    // Both employees should now sit at the other's former desk.
    const employees = useEmployeeStore.getState().employees
    expect(employees['a'].seatId).toBe('d2')
    expect(employees['a'].floorId).toBe('f1')
    expect(employees['b'].seatId).toBe('d1')
    expect(employees['b'].floorId).toBe('f1')

    // Element side should reflect the swap too.
    const elements = useElementsStore.getState().elements
    expect((elements['d1'] as DeskElement).assignedEmployeeId).toBe('b')
    expect((elements['d2'] as DeskElement).assignedEmployeeId).toBe('a')

    const req = useSeatSwapsStore.getState().requests[res.id]
    expect(req.status).toBe('approved')
    expect(req.resolvedBy).toBe('admin-1')
    expect(req.resolvedAt).not.toBeNull()
  })

  it('deny() marks the request denied without touching seats', () => {
    seedTwoSeatedEmployees()
    const res = useSeatSwapsStore.getState().create('a', 'b', '')
    expect(res.ok).toBe(true)
    if (!res.ok) return

    useSeatSwapsStore.getState().deny(res.id, 'admin-1')

    const employees = useEmployeeStore.getState().employees
    expect(employees['a'].seatId).toBe('d1')
    expect(employees['b'].seatId).toBe('d2')

    const req = useSeatSwapsStore.getState().requests[res.id]
    expect(req.status).toBe('denied')
    expect(req.resolvedBy).toBe('admin-1')
  })

  it('cancel() marks a pending request canceled', () => {
    seedTwoSeatedEmployees()
    const res = useSeatSwapsStore.getState().create('a', 'b', '')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    useSeatSwapsStore.getState().cancel(res.id)
    const req = useSeatSwapsStore.getState().requests[res.id]
    expect(req.status).toBe('canceled')
    expect(req.resolvedAt).not.toBeNull()
  })

  it('approve() / deny() / cancel() are no-ops on non-pending requests', () => {
    seedTwoSeatedEmployees()
    const res = useSeatSwapsStore.getState().create('a', 'b', '')
    if (!res.ok) throw new Error('setup failed')
    useSeatSwapsStore.getState().approve(res.id, 'admin')
    const approvedSnapshot = useSeatSwapsStore.getState().requests[res.id]
    // Further transitions should not mutate the already-approved request.
    useSeatSwapsStore.getState().deny(res.id, 'admin')
    useSeatSwapsStore.getState().cancel(res.id)
    expect(useSeatSwapsStore.getState().requests[res.id]).toEqual(approvedSnapshot)
  })

  it('rejects creating a swap with the same employee on both sides', () => {
    useEmployeeStore.setState({
      employees: { a: makeEmployee('a', { seatId: 'd1', floorId: 'f1' }) },
    })
    const res = useSeatSwapsStore.getState().create('a', 'a', '')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('same-employee')
  })
})
