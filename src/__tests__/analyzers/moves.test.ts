import { describe, it, expect } from 'vitest'
import { analyzeMoves } from '../../lib/analyzers/moves'
import type { Employee } from '../../types/employee'
import type { DeskElement } from '../../types/elements'

function makeDeskElement(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: overrides.id || 'desk-1',
    type: 'desk',
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Desk', visible: true,
    style: { fill: '#FEF3C7', stroke: '#D97706', strokeWidth: 1, opacity: 1 },
    deskId: overrides.deskId || 'D-101',
    assignedEmployeeId: overrides.assignedEmployeeId ?? null,
    capacity: 1,
    zone: overrides.zone,
    ...overrides,
  } as DeskElement
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], accommodations: [], seatId: null, floorId: null,
    status: 'active',
    leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
    leaveNotes: null, departureDate: null,
    pendingStatusChanges: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('analyzeMoves', () => {
  it('returns empty when no employees have pending-move tag', () => {
    const result = analyzeMoves({
      elements: [],
      employees: [makeEmployee()],
      zones: new Map(),
    })
    expect(result).toEqual([])
  })

  it('returns info for employee with pending-move tag', () => {
    const result = analyzeMoves({
      elements: [
        makeDeskElement({ id: 'd-1', deskId: 'D-1', assignedEmployeeId: 'e1' }),
      ],
      employees: [
        makeEmployee({ id: 'e1', name: 'Alice', seatId: 'D-1', tags: ['pending-move'] }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].category).toBe('moves')
    expect(result[0].title).toContain('Alice')
  })

  it('detects multiple pending moves and creates aggregate insight', () => {
    const result = analyzeMoves({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'Alice', tags: ['pending-move'] }),
        makeEmployee({ id: 'e2', name: 'Bob', tags: ['pending-move'] }),
        makeEmployee({ id: 'e3', name: 'Carol', tags: ['pending-move'] }),
      ],
      zones: new Map(),
    })

    // Individual + aggregate
    expect(result.length).toBe(4)
    const aggregate = result.find(r => r.id === 'moves-aggregate')
    expect(aggregate).toBeDefined()
    expect(aggregate!.title).toContain('3')
  })
})
