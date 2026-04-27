/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { analyzePlan } from '../lib/planHealth'
import type {
  CanvasElement,
  DeskElement,
  DoorElement,
  WallElement,
  WorkstationElement,
  PrivateOfficeElement,
} from '../types/elements'
import type { Employee } from '../types/employee'
import type { Neighborhood } from '../types/neighborhood'

function emp(id: string, overrides: Partial<Employee> = {}): Employee {
  return {
    id,
    name: id,
    email: '',
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
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function desk(id: string, overrides: Partial<DeskElement> = {}): DeskElement {
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
    deskId: `D-${id}`,
    assignedEmployeeId: null,
    capacity: 1,
    ...overrides,
  }
}

function workstation(id: string, overrides: Partial<WorkstationElement> = {}): WorkstationElement {
  return {
    id,
    type: 'workstation',
    x: 0,
    y: 0,
    width: 200,
    height: 80,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: `W-${id}`,
    positions: 4,
    // Sparse positional default — length === positions, all empty.
    // Tests can supply `assignedEmployeeIds` via `overrides`; those
    // pass through verbatim (the analyzer counts truthy entries).
    assignedEmployeeIds: [null, null, null, null],
    ...overrides,
  }
}

function privateOffice(id: string, overrides: Partial<PrivateOfficeElement> = {}): PrivateOfficeElement {
  return {
    id,
    type: 'private-office',
    x: 0,
    y: 0,
    width: 120,
    height: 100,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: `PO-${id}`,
    capacity: 1,
    assignedEmployeeIds: [],
    ...overrides,
  }
}

function wall(id: string, overrides: Partial<WallElement> = {}): WallElement {
  return {
    id,
    type: 'wall',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    points: [0, 0, 200, 0],
    thickness: 4,
    wallType: 'solid',
    ...overrides,
  }
}

function door(id: string, overrides: Partial<DoorElement> = {}): DoorElement {
  return {
    id,
    type: 'door',
    x: 0,
    y: 0,
    width: 30,
    height: 8,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    parentWallId: '',
    positionOnWall: 0.5,
    swingDirection: 'left',
    openAngle: 90,
    ...overrides,
  }
}

function neighborhood(id: string, overrides: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id,
    name: id,
    color: '#3B82F6',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    floorId: 'f1',
    ...overrides,
  }
}

function input(args: {
  floorIds?: string[]
  activeFloorId?: string | null
  elementsByFloor?: Record<string, Record<string, CanvasElement>>
  neighborhoodsByFloor?: Record<string, Record<string, Neighborhood>>
  employees?: Record<string, Employee>
}) {
  return {
    floorIds: args.floorIds ?? ['f1'],
    activeFloorId: args.activeFloorId ?? 'f1',
    elementsByFloor: args.elementsByFloor ?? { f1: {} },
    neighborhoodsByFloor: args.neighborhoodsByFloor ?? { f1: {} },
    employees: args.employees ?? {},
  }
}

describe('analyzePlan', () => {
  it('returns a healthy plan with zero issues for an empty office', () => {
    const result = analyzePlan(input({}))
    expect(result.errorCount).toBe(0)
    expect(result.warningCount).toBe(0)
    expect(result.infoCount).toBe(0)
    expect(result.issues).toHaveLength(0)
  })

  it('flags an employee whose seatId points to a deleted desk', () => {
    const result = analyzePlan(
      input({
        employees: { e1: emp('e1', { name: 'Sarah', seatId: 'missing-desk' }) },
      }),
    )
    const issue = result.issues.find((i) => i.id === 'emp-ref-broken:e1')
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe('error')
    expect(issue!.category).toBe('reference')
    expect(issue!.targetIds).toEqual(['e1'])
    expect(issue!.message).toMatch(/Sarah/)
    expect(result.errorCount).toBeGreaterThanOrEqual(1)
  })

  it('flags a desk that references a non-existent employee', () => {
    const result = analyzePlan(
      input({
        elementsByFloor: {
          f1: { d1: desk('d1', { assignedEmployeeId: 'ghost' }) },
        },
      }),
    )
    const issue = result.issues.find((i) => i.id === 'desk-emp-missing:d1')
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe('error')
    expect(issue!.floorId).toBe('f1')
  })

  it('flags a workstation over capacity and with stale employee ids', () => {
    const result = analyzePlan(
      input({
        elementsByFloor: {
          f1: {
            ws: workstation('ws', { positions: 2, assignedEmployeeIds: ['e1', 'e2', 'e3'] }),
          },
        },
        employees: { e1: emp('e1') }, // e2, e3 are stale
      }),
    )
    expect(result.issues.find((i) => i.id === 'ws-overcap:ws')?.severity).toBe('error')
    expect(result.issues.find((i) => i.id === 'ws-stale-emp:ws')?.severity).toBe('error')
  })

  it('flags a private office over capacity', () => {
    const result = analyzePlan(
      input({
        elementsByFloor: {
          f1: {
            po: privateOffice('po', { capacity: 1, assignedEmployeeIds: ['e1', 'e2'] }),
          },
        },
        employees: { e1: emp('e1'), e2: emp('e2') },
      }),
    )
    expect(result.issues.find((i) => i.id === 'po-overcap:po')?.severity).toBe('error')
  })

  it('flags a door not attached to any wall', () => {
    const result = analyzePlan(
      input({
        elementsByFloor: {
          f1: {
            // No wall present and the door has no parentWallId.
            d: door('d', { x: 500, y: 500 }),
          },
        },
      }),
    )
    const issue = result.issues.find((i) => i.id === 'unattached:d')
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe('warning')
    expect(issue!.category).toBe('attachment')
  })

  it('does not flag a door whose parent wall still exists', () => {
    const result = analyzePlan(
      input({
        elementsByFloor: {
          f1: {
            w: wall('w'),
            d: door('d', { x: 1000, y: 1000, parentWallId: 'w' }),
          },
        },
      }),
    )
    expect(result.issues.find((i) => i.id === 'unattached:d')).toBeUndefined()
  })

  it('does not flag a door close to a wall AABB', () => {
    const result = analyzePlan(
      input({
        elementsByFloor: {
          f1: {
            w: wall('w'), // at (0,0) — (200,0)
            d: door('d', { x: 100, y: 5, parentWallId: '' }),
          },
        },
      }),
    )
    expect(result.issues.find((i) => i.id === 'unattached:d')).toBeUndefined()
  })

  it('emits a single overlap issue per pair regardless of order', () => {
    const result = analyzePlan(
      input({
        elementsByFloor: {
          f1: {
            d1: desk('d1', { x: 0, y: 0, width: 60, height: 40 }),
            d2: desk('d2', { x: 5, y: 5, width: 60, height: 40 }),
          },
        },
      }),
    )
    const overlaps = result.issues.filter((i) => i.category === 'collision')
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0].targetIds.sort()).toEqual(['d1', 'd2'])
  })

  it('flags a hot-desk that has a persistent assignment', () => {
    const result = analyzePlan(
      input({
        elementsByFloor: {
          f1: {
            h: desk('h', { type: 'hot-desk', assignedEmployeeId: 'e1' }),
          },
        },
        employees: { e1: emp('e1') },
      }),
    )
    const issue = result.issues.find((i) => i.id === 'hot-desk-assigned:h')
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe('warning')
  })

  it('flags an empty neighborhood as info', () => {
    const result = analyzePlan(
      input({
        neighborhoodsByFloor: {
          f1: { n1: neighborhood('n1', { x: 1000, y: 1000, width: 50, height: 50 }) },
        },
        elementsByFloor: { f1: { d1: desk('d1', { x: 0, y: 0 }) } },
      }),
    )
    const issue = result.issues.find((i) => i.id === 'empty-neighborhood:n1')
    expect(issue).toBeDefined()
    expect(issue!.severity).toBe('info')
    expect(issue!.category).toBe('orphan')
  })

  it('does not flag a neighborhood that contains a desk', () => {
    const result = analyzePlan(
      input({
        neighborhoodsByFloor: {
          f1: { n1: neighborhood('n1', { x: 0, y: 0, width: 400, height: 400 }) },
        },
        elementsByFloor: { f1: { d1: desk('d1', { x: 0, y: 0 }) } },
      }),
    )
    expect(result.issues.find((i) => i.id === 'empty-neighborhood:n1')).toBeUndefined()
  })

  it('sorts errors before warnings before info', () => {
    const result = analyzePlan(
      input({
        elementsByFloor: {
          f1: {
            d: door('d', { x: 9999, y: 9999 }), // warning
            d1: desk('d1', { assignedEmployeeId: 'ghost' }), // error
          },
          // empty neighborhoods → info
        },
        neighborhoodsByFloor: {
          f1: { n1: neighborhood('n1', { x: 5000, y: 5000, width: 10, height: 10 }) },
        },
      }),
    )
    const sevs = result.issues.map((i) => i.severity)
    const indexOf = (s: string) => sevs.indexOf(s as any)
    expect(indexOf('error')).toBeLessThan(indexOf('warning'))
    expect(indexOf('warning')).toBeLessThan(indexOf('info'))
  })

  it('walks every floor, not just the active one', () => {
    const result = analyzePlan(
      input({
        floorIds: ['f1', 'f2'],
        activeFloorId: 'f1',
        elementsByFloor: {
          f1: {},
          f2: { d1: desk('d1', { assignedEmployeeId: 'ghost' }) },
        },
        neighborhoodsByFloor: { f1: {}, f2: {} },
      }),
    )
    const issue = result.issues.find((i) => i.id === 'desk-emp-missing:d1')
    expect(issue).toBeDefined()
    expect(issue!.floorId).toBe('f2')
  })

  it('runs on a 500-element office in well under 50ms', () => {
    const elements: Record<string, CanvasElement> = {}
    for (let i = 0; i < 500; i++) {
      // Spread desks far apart so we never trigger the O(n²) overlap path.
      elements[`d${i}`] = desk(`d${i}`, { x: i * 200, y: 0 })
    }
    const start = performance.now()
    const result = analyzePlan(
      input({
        elementsByFloor: { f1: elements },
      }),
    )
    const dur = performance.now() - start
    expect(dur).toBeLessThan(50)
    expect(result.errorCount).toBe(0)
  })

  it('caps overlap-pair issues at 25 even when many desks overlap', () => {
    const elements: Record<string, CanvasElement> = {}
    // 10 desks all stacked at the origin → C(10,2) = 45 raw pairs.
    for (let i = 0; i < 10; i++) {
      elements[`d${i}`] = desk(`d${i}`, { x: 0, y: 0 })
    }
    const result = analyzePlan(input({ elementsByFloor: { f1: elements } }))
    const overlaps = result.issues.filter((i) => i.category === 'collision')
    expect(overlaps.length).toBeLessThanOrEqual(25)
    expect(overlaps.length).toBeGreaterThan(0)
  })
})
