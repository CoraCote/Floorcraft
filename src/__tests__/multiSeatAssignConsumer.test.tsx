import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../stores/uiStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { consumeQueueAtElement } from '../lib/multiSeatAssign'
import type { Employee } from '../types/employee'
import type { DeskElement, WorkstationElement } from '../types/elements'

function emp(id: string, name: string): Employee {
  return { id, name, seatId: null, floorId: null, status: 'active' } as unknown as Employee
}
function desk(id: string): DeskElement {
  return {
    id, type: 'desk', x: 0, y: 0, width: 60, height: 60,
    rotation: 0, locked: false, groupId: null, zIndex: 0, visible: true,
    label: '', deskId: 'D-' + id, assignedEmployeeId: null, capacity: 1,
  } as unknown as DeskElement
}
function workstation(id: string, positions: number): WorkstationElement {
  return {
    id, type: 'workstation', x: 0, y: 0, width: 120, height: 60,
    rotation: 0, locked: false, groupId: null, zIndex: 0, visible: true,
    label: '', deskId: 'W-' + id, positions,
    // Workstation `assignedEmployeeIds` is now a sparse positional
    // array of length === positions; tests must respect that
    // invariant or `consumeQueueAtElement` won't see any open slots.
    assignedEmployeeIds: Array.from({ length: positions }, () => null),
  } as unknown as WorkstationElement
}

beforeEach(() => {
  useEmployeeStore.setState({
    employees: {
      e1: emp('e1', 'Alice'),
      e2: emp('e2', 'Bob'),
      e3: emp('e3', 'Carol'),
    },
    departmentColors: {},
  } as never)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useUIStore.setState({ assignmentQueue: [] })
})

describe('consumeQueueAtElement', () => {
  it('assigns one employee to a desk and shortens the queue', () => {
    useElementsStore.setState({ elements: { d1: desk('d1') } })
    useUIStore.getState().setAssignmentQueue(['e1', 'e2', 'e3'])

    const overflow = consumeQueueAtElement('d1', 'f1')

    expect(overflow).toBe(0)
    expect(useUIStore.getState().assignmentQueue).toEqual(['e2', 'e3'])
    const after = useEmployeeStore.getState().employees
    expect(after.e1.seatId).toBe('d1')
  })

  it('fills a 3-seat workstation from a 3-employee queue', () => {
    useElementsStore.setState({ elements: { w1: workstation('w1', 3) } })
    useUIStore.getState().setAssignmentQueue(['e1', 'e2', 'e3'])

    const overflow = consumeQueueAtElement('w1', 'f1')

    expect(overflow).toBe(0)
    expect(useUIStore.getState().assignmentQueue).toEqual([])
    const emps = useEmployeeStore.getState().employees
    expect([emps.e1.seatId, emps.e2.seatId, emps.e3.seatId]).toEqual(['w1', 'w1', 'w1'])
  })

  it('reports overflow when workstation has fewer open seats than queue length', () => {
    useElementsStore.setState({
      elements: { w1: workstation('w1', 2) },
    })
    useUIStore.getState().setAssignmentQueue(['e1', 'e2', 'e3'])

    const overflow = consumeQueueAtElement('w1', 'f1')

    expect(overflow).toBe(1)
    expect(useUIStore.getState().assignmentQueue).toEqual(['e3'])
  })

  it('returns -1 when the target is not assignable (no-op)', () => {
    useElementsStore.setState({
      elements: { r1: { id: 'r1', type: 'wall' } as never },
    })
    useUIStore.getState().setAssignmentQueue(['e1'])

    const overflow = consumeQueueAtElement('r1', 'f1')

    expect(overflow).toBe(-1)
    expect(useUIStore.getState().assignmentQueue).toEqual(['e1'])
  })
})
