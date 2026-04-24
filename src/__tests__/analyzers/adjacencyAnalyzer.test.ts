import { describe, it, expect } from 'vitest'
import { analyzeAdjacency } from '../../lib/analyzers/adjacency'
import type { CanvasElement, DeskElement } from '../../types/elements'
import type { Employee } from '../../types/employee'

/**
 * Adjacency conflict analyzer — flags pairs of employees that share a
 * sensitivity tag AND sit at desks within 200px of each other on the
 * same floor. Free-text tags: the user-supplied vocabulary drives the
 * signal, so the analyzer is intentionally dumb about semantics.
 */

function makeDesk(
  id: string,
  x: number,
  y: number,
  overrides: Partial<DeskElement> = {},
): DeskElement {
  return {
    id,
    type: 'desk',
    x,
    y,
    width: 72,
    height: 48,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Desk',
    visible: true,
    style: { fill: '#FEF3C7', stroke: '#D97706', strokeWidth: 1, opacity: 1 },
    deskId: id,
    assignedEmployeeId: null,
    capacity: 1,
    ...overrides,
  } as DeskElement
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '',
    department: null,
    team: null,
    title: null,
    managerId: null,
    employmentType: 'full-time',
    officeDays: [],
    startDate: null,
    endDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: null,
    tags: [],
    accommodations: [],
    sensitivityTags: [],
    seatId: null,
    floorId: null,
    status: 'active',
    leaveType: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    departureDate: null,
    pendingStatusChanges: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('analyzeAdjacency', () => {
  it('warns when two audit-tagged employees sit at adjacent desks on the same floor', () => {
    const d1 = makeDesk('d1', 0, 0)
    const d2 = makeDesk('d2', 120, 0) // 120px away (< 200)
    const elements: CanvasElement[] = [d1, d2]
    const employees = [
      makeEmployee({
        id: 'jane',
        name: 'Jane Doe',
        seatId: 'd1',
        floorId: 'f1',
        sensitivityTags: ['audit'],
      }),
      makeEmployee({
        id: 'bob',
        name: 'Bob Smith',
        seatId: 'd2',
        floorId: 'f1',
        sensitivityTags: ['audit'],
      }),
    ]

    const result = analyzeAdjacency({ elements, employees, zones: new Map() })

    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('sensitivity')
    expect(result[0].severity).toBe('warning')
    expect(result[0].title).toContain('audit')
    expect(result[0].title).toContain('Jane Doe')
    expect(result[0].title).toContain('Bob Smith')
    expect(result[0].relatedEmployeeIds.sort()).toEqual(['bob', 'jane'])
    expect(result[0].relatedElementIds.sort()).toEqual(['d1', 'd2'])
  })

  it('does not flag same-tag employees on different floors', () => {
    const d1 = makeDesk('d1', 0, 0)
    const d2 = makeDesk('d2', 50, 0)
    const employees = [
      makeEmployee({ id: 'a', seatId: 'd1', floorId: 'f1', sensitivityTags: ['audit'] }),
      makeEmployee({ id: 'b', seatId: 'd2', floorId: 'f2', sensitivityTags: ['audit'] }),
    ]
    const result = analyzeAdjacency({ elements: [d1, d2], employees, zones: new Map() })
    expect(result).toEqual([])
  })

  it('does not flag same-tag employees farther than 200px apart', () => {
    const d1 = makeDesk('d1', 0, 0)
    const d2 = makeDesk('d2', 250, 0) // 250px — beyond the threshold
    const employees = [
      makeEmployee({ id: 'a', seatId: 'd1', floorId: 'f1', sensitivityTags: ['legal'] }),
      makeEmployee({ id: 'b', seatId: 'd2', floorId: 'f1', sensitivityTags: ['legal'] }),
    ]
    const result = analyzeAdjacency({ elements: [d1, d2], employees, zones: new Map() })
    expect(result).toEqual([])
  })

  it('does not flag when either employee has no sensitivity tags', () => {
    const d1 = makeDesk('d1', 0, 0)
    const d2 = makeDesk('d2', 50, 0)
    const employees = [
      makeEmployee({ id: 'a', seatId: 'd1', floorId: 'f1', sensitivityTags: ['audit'] }),
      makeEmployee({ id: 'b', seatId: 'd2', floorId: 'f1', sensitivityTags: [] }),
    ]
    const result = analyzeAdjacency({ elements: [d1, d2], employees, zones: new Map() })
    expect(result).toEqual([])
  })

  it('does not flag when the shared vocabulary does not overlap', () => {
    const d1 = makeDesk('d1', 0, 0)
    const d2 = makeDesk('d2', 50, 0)
    const employees = [
      makeEmployee({ id: 'a', seatId: 'd1', floorId: 'f1', sensitivityTags: ['audit'] }),
      makeEmployee({ id: 'b', seatId: 'd2', floorId: 'f1', sensitivityTags: ['legal'] }),
    ]
    const result = analyzeAdjacency({ elements: [d1, d2], employees, zones: new Map() })
    expect(result).toEqual([])
  })

  it('emits a single insight per adjacent pair, not per shared tag', () => {
    const d1 = makeDesk('d1', 0, 0)
    const d2 = makeDesk('d2', 50, 0)
    const employees = [
      makeEmployee({
        id: 'a',
        name: 'Alice',
        seatId: 'd1',
        floorId: 'f1',
        sensitivityTags: ['audit', 'legal'],
      }),
      makeEmployee({
        id: 'b',
        name: 'Bob',
        seatId: 'd2',
        floorId: 'f1',
        sensitivityTags: ['audit', 'legal'],
      }),
    ]
    const result = analyzeAdjacency({ elements: [d1, d2], employees, zones: new Map() })
    expect(result).toHaveLength(1)
  })

  it('uses the redacted name projection in the title when fed an initials-only employee map', () => {
    // Mirrors the real runtime path: `useVisibleEmployees` redacts
    // names to initials ("Jane Doe" -> "J.D.") before the Insights
    // Panel feeds employees into the analyzers. Passing initials in
    // directly proves the title carries whatever name the analyzer
    // received — no re-wiring needed to respect PII.
    const d1 = makeDesk('d1', 0, 0)
    const d2 = makeDesk('d2', 50, 0)
    const employees = [
      makeEmployee({
        id: 'a',
        name: 'J.D.',
        seatId: 'd1',
        floorId: 'f1',
        sensitivityTags: ['audit'],
      }),
      makeEmployee({
        id: 'b',
        name: 'B.S.',
        seatId: 'd2',
        floorId: 'f1',
        sensitivityTags: ['audit'],
      }),
    ]

    const result = analyzeAdjacency({ elements: [d1, d2], employees, zones: new Map() })
    expect(result).toHaveLength(1)
    expect(result[0].title).toContain('J.D.')
    expect(result[0].title).toContain('B.S.')
    // A redacted projection must never accidentally embed the full name.
    expect(result[0].title).not.toContain('Jane')
    expect(result[0].title).not.toContain('Bob')
  })

  it('ignores employees without a seat', () => {
    const d1 = makeDesk('d1', 0, 0)
    const employees = [
      makeEmployee({ id: 'a', seatId: 'd1', floorId: 'f1', sensitivityTags: ['audit'] }),
      makeEmployee({ id: 'b', seatId: null, floorId: null, sensitivityTags: ['audit'] }),
    ]
    const result = analyzeAdjacency({ elements: [d1], employees, zones: new Map() })
    expect(result).toEqual([])
  })
})
