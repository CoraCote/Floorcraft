/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { assignEmployee, swapEmployees } from '../lib/seatAssignment'
import type { DeskElement } from '../types/elements'
import type { Employee } from '../types/employee'

// Baseline employee shape used by every test — includes all array fields
// `migrateEmployees` back-fills so the store never complains about
// legacy payloads. Override `name`/`id`/etc via `overrides`.
function makeEmployee(overrides: Partial<Employee>): Employee {
  return {
    id: overrides.id!,
    name: overrides.name!,
    email: overrides.email ?? `${overrides.id!}@example.com`,
    department: overrides.department ?? 'Engineering',
    team: overrides.team ?? null,
    title: overrides.title ?? null,
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

function makeDesk(id: string): DeskElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
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
    assignedEmployeeId: null,
    capacity: 1,
  } as DeskElement
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  })
})

describe('swapEmployees', () => {
  it('swaps two already-seated employees in one call', () => {
    const dA = makeDesk('dA')
    const dB = makeDesk('dB')
    useElementsStore.setState({ elements: { dA, dB } })
    useEmployeeStore.setState({
      employees: {
        e1: makeEmployee({ id: 'e1', name: 'Alice' }),
        e2: makeEmployee({ id: 'e2', name: 'Bob' }),
      },
    })
    assignEmployee('e1', 'dA', 'f1')
    assignEmployee('e2', 'dB', 'f1')

    const result = swapEmployees('e1', 'e2')
    expect(result).toEqual({ aSeat: 'dA', bSeat: 'dB' })

    const employees = useEmployeeStore.getState().employees
    expect(employees['e1'].seatId).toBe('dB')
    expect(employees['e2'].seatId).toBe('dA')
    const elements = useElementsStore.getState().elements
    expect((elements['dA'] as DeskElement).assignedEmployeeId).toBe('e2')
    expect((elements['dB'] as DeskElement).assignedEmployeeId).toBe('e1')
  })

  it('returns null when either employee is not seated', () => {
    const dA = makeDesk('dA')
    useElementsStore.setState({ elements: { dA } })
    useEmployeeStore.setState({
      employees: {
        e1: makeEmployee({ id: 'e1', name: 'Alice' }),
        e2: makeEmployee({ id: 'e2', name: 'Bob' }),
      },
    })
    assignEmployee('e1', 'dA', 'f1')
    // e2 is not seated — swap should bail out with null.
    const result = swapEmployees('e1', 'e2')
    expect(result).toBeNull()
    const employees = useEmployeeStore.getState().employees
    // State unchanged.
    expect(employees['e1'].seatId).toBe('dA')
    expect(employees['e2'].seatId).toBeNull()
  })

  it('no-op when swapping an employee with themselves', () => {
    const dA = makeDesk('dA')
    useElementsStore.setState({ elements: { dA } })
    useEmployeeStore.setState({
      employees: { e1: makeEmployee({ id: 'e1', name: 'Alice' }) },
    })
    assignEmployee('e1', 'dA', 'f1')
    expect(swapEmployees('e1', 'e1')).toBeNull()
    expect(useEmployeeStore.getState().employees['e1'].seatId).toBe('dA')
  })
})
