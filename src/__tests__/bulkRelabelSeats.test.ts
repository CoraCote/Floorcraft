import { describe, it, expect, beforeEach } from 'vitest'
import { bulkRelabelSeats } from '../lib/seats/bulkRelabelSeats'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import type { Employee } from '../types/employee'
import type { CanvasElement } from '../types/elements'

function emp(id: string, seatId: string | null, floorId: string | null): Employee {
  return {
    id,
    name: id.toUpperCase(),
    email: `${id}@t`,
    department: null,
    team: null,
    title: null,
    seatId,
    floorId,
    status: 'active',
    employmentType: null,
    managerId: null,
    officeDays: [],
    startDate: null,
    endDate: null,
    departureDate: null,
    tags: [],
    equipmentNeeds: [],
    equipmentStatus: null,
    photoUrl: null,
  } as unknown as Employee
}

function desk(id: string, label = ''): CanvasElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label,
    visible: true,
    style: {},
    deskId: `D-${id}`,
    capacity: 1,
    assignedEmployeeId: null,
  } as unknown as CanvasElement
}

describe('bulkRelabelSeats', () => {
  beforeEach(() => {
    useEmployeeStore.setState({ employees: {} })
    useElementsStore.setState({ elements: {} })
    useFloorStore.setState({
      floors: [
        { id: 'f1', name: 'Active', order: 0, elements: {} },
        { id: 'f2', name: 'Other', order: 1, elements: {} },
      ],
      activeFloorId: 'f1',
    })
  })

  it('applies prefixed numeric labels to active-floor seats', () => {
    useEmployeeStore.setState({
      employees: {
        e1: emp('e1', 's1', 'f1'),
        e2: emp('e2', 's2', 'f1'),
      },
    })
    useElementsStore.setState({
      elements: { s1: desk('s1'), s2: desk('s2') },
    })
    useFloorStore.setState({
      floors: [
        { id: 'f1', name: 'Active', order: 0, elements: { s1: desk('s1'), s2: desk('s2') } },
        { id: 'f2', name: 'Other', order: 1, elements: {} },
      ],
      activeFloorId: 'f1',
    })

    const out = bulkRelabelSeats(['e1', 'e2'], 'N1')
    expect(out).toEqual({ relabeled: 2, skipped: 0 })
    const elements = useElementsStore.getState().elements
    expect(elements.s1.label).toBe('N1 1')
    expect(elements.s2.label).toBe('N1 2')
  })

  it('skips employees without a seat (mixed selection is fine)', () => {
    useEmployeeStore.setState({
      employees: {
        e1: emp('e1', 's1', 'f1'),
        e2: emp('e2', null, null),
      },
    })
    useElementsStore.setState({ elements: { s1: desk('s1') } })
    useFloorStore.setState({
      floors: [
        { id: 'f1', name: 'Active', order: 0, elements: { s1: desk('s1') } },
        { id: 'f2', name: 'Other', order: 1, elements: {} },
      ],
      activeFloorId: 'f1',
    })
    const out = bulkRelabelSeats(['e1', 'e2'], 'A')
    expect(out).toEqual({ relabeled: 1, skipped: 1 })
    expect(useElementsStore.getState().elements.s1.label).toBe('A 1')
  })

  it('clears labels when prefix is empty', () => {
    useEmployeeStore.setState({
      employees: { e1: emp('e1', 's1', 'f1') },
    })
    useElementsStore.setState({ elements: { s1: desk('s1', 'old') } })
    useFloorStore.setState({
      floors: [
        { id: 'f1', name: 'Active', order: 0, elements: { s1: desk('s1', 'old') } },
        { id: 'f2', name: 'Other', order: 1, elements: {} },
      ],
      activeFloorId: 'f1',
    })
    const out = bulkRelabelSeats(['e1'], '   ')
    expect(out.relabeled).toBe(1)
    expect(useElementsStore.getState().elements.s1.label).toBe('')
  })

  it('writes to off-active floors via setFloorElements', () => {
    useEmployeeStore.setState({
      employees: { e1: emp('e1', 's-other', 'f2') },
    })
    useFloorStore.setState({
      floors: [
        { id: 'f1', name: 'Active', order: 0, elements: {} },
        { id: 'f2', name: 'Other', order: 1, elements: { 's-other': desk('s-other') } },
      ],
      activeFloorId: 'f1',
    })
    const out = bulkRelabelSeats(['e1'], 'F2')
    expect(out).toEqual({ relabeled: 1, skipped: 0 })
    const otherFloor = useFloorStore
      .getState()
      .floors.find((f) => f.id === 'f2')!
    expect(otherFloor.elements['s-other'].label).toBe('F2 1')
  })
})
