/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import { useSeatHistoryStore } from '../stores/seatHistoryStore'
import { assignEmployee, unassignEmployee } from '../lib/seatAssignment'
import type { DeskElement, BaseElement } from '../types/elements'

function makeBase(overrides: Partial<BaseElement>): BaseElement {
  return {
    id: overrides.id!,
    type: overrides.type!,
    x: 0, y: 0, width: 50, height: 50, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: '', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    ...overrides,
  }
}

function makeDesk(id: string): DeskElement {
  return {
    ...makeBase({ id, type: 'desk' }),
    type: 'desk',
    deskId: `D-${id}`,
    assignedEmployeeId: null,
    capacity: 1,
  } as DeskElement
}

function makeEmployee(id: string, name: string) {
  return {
    id, name, email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    status: 'active',
    startDate: null, endDate: null,
    leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
    leaveNotes: null, departureDate: null,
    equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], seatId: null, floorId: null,
    createdAt: new Date().toISOString(),
  } as any
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  })
  useProjectStore.setState({ currentUserId: 'actor-1' })
  useSeatHistoryStore.getState().clear()
})

describe('seat assignment history integration', () => {
  it('records an "assign" entry when an unassigned employee takes a fresh desk', () => {
    useElementsStore.setState({ elements: { d1: makeDesk('d1') } })
    useEmployeeStore.setState({ employees: { alice: makeEmployee('alice', 'Alice') } })

    assignEmployee('alice', 'd1', 'f1')

    const rows = useSeatHistoryStore.getState().entriesForSeat('d1')
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('assign')
    expect(rows[0].employeeId).toBe('alice')
    expect(rows[0].previousEmployeeId).toBeNull()
    expect(rows[0].actorUserId).toBe('actor-1')
  })

  it('records an "unassign" entry on unassignEmployee', () => {
    const desk = { ...makeDesk('d1'), assignedEmployeeId: 'alice' } as DeskElement
    useElementsStore.setState({ elements: { d1: desk } })
    useEmployeeStore.setState({
      employees: {
        alice: { ...makeEmployee('alice', 'Alice'), seatId: 'd1', floorId: 'f1' },
      },
    })

    unassignEmployee('alice')

    const rows = useSeatHistoryStore.getState().entriesForSeat('d1')
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('unassign')
    expect(rows[0].employeeId).toBeNull()
    expect(rows[0].previousEmployeeId).toBe('alice')
  })

  it('records a "reassign" entry when a desk is handed off to a new employee', () => {
    const desk = { ...makeDesk('d1'), assignedEmployeeId: 'alice' } as DeskElement
    useElementsStore.setState({ elements: { d1: desk } })
    useEmployeeStore.setState({
      employees: {
        alice: { ...makeEmployee('alice', 'Alice'), seatId: 'd1', floorId: 'f1' },
        bob: makeEmployee('bob', 'Bob'),
      },
    })

    assignEmployee('bob', 'd1', 'f1')

    const rows = useSeatHistoryStore.getState().entriesForSeat('d1')
    // One "reassign" entry on d1 — the desk handoff. No duplicate.
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('reassign')
    expect(rows[0].employeeId).toBe('bob')
    expect(rows[0].previousEmployeeId).toBe('alice')
  })

  it('emits a secondary "unassign" entry on the vacated seat when the assignee moves desks', () => {
    useElementsStore.setState({
      elements: { d1: makeDesk('d1'), d2: makeDesk('d2') },
    })
    useEmployeeStore.setState({
      employees: { alice: makeEmployee('alice', 'Alice') },
    })

    // First take d1, then move to d2.
    assignEmployee('alice', 'd1', 'f1')
    assignEmployee('alice', 'd2', 'f1')

    const d1Rows = useSeatHistoryStore.getState().entriesForSeat('d1')
    // One "assign" (took it) + one "unassign" (vacated on move).
    expect(d1Rows.map((r) => r.action).sort()).toEqual(['assign', 'unassign'])

    const d2Rows = useSeatHistoryStore.getState().entriesForSeat('d2')
    expect(d2Rows).toHaveLength(1)
    expect(d2Rows[0].action).toBe('assign')
    expect(d2Rows[0].employeeId).toBe('alice')
  })

  it('tags the entry with the current actorUserId from projectStore', () => {
    useProjectStore.setState({ currentUserId: 'specific-actor' })
    useElementsStore.setState({ elements: { d1: makeDesk('d1') } })
    useEmployeeStore.setState({ employees: { alice: makeEmployee('alice', 'Alice') } })
    assignEmployee('alice', 'd1', 'f1')
    const rows = useSeatHistoryStore.getState().entriesForSeat('d1')
    expect(rows[0].actorUserId).toBe('specific-actor')
  })

  it('falls back to a null actor when no session is loaded', () => {
    useProjectStore.setState({ currentUserId: null })
    useElementsStore.setState({ elements: { d1: makeDesk('d1') } })
    useEmployeeStore.setState({ employees: { alice: makeEmployee('alice', 'Alice') } })
    assignEmployee('alice', 'd1', 'f1')
    expect(useSeatHistoryStore.getState().entriesForSeat('d1')[0].actorUserId).toBeNull()
  })
})
