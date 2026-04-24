import { describe, it, expect } from 'vitest'
import { computeUtilizationMetricsByFloor } from '../lib/utilizationMetrics'
import type { CanvasElement } from '../types/elements'
import type { Employee } from '../types/employee'
import type { Floor } from '../types/floor'

// Fixtures mirror the ones in utilizationMetrics.test.ts — keeping the shape
// identical across the suite makes it easier to jump between tests.

function emp(id: string, over: Partial<Employee> = {}): Employee {
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
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: null,
    tags: [],
    seatId: null,
    floorId: null,
    createdAt: new Date().toISOString(),
    leaveType: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    departureDate: null,
    accommodations: [],
    pendingStatusChanges: [],
    sensitivityTags: [],
    ...over,
  }
}

function desk(id: string, assigned: string | null): CanvasElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: id,
    assignedEmployeeId: assigned,
    capacity: 1,
  } as unknown as CanvasElement
}

function phoneBooth(id: string): CanvasElement {
  return {
    id,
    type: 'phone-booth',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  } as unknown as CanvasElement
}

function toMap<T extends { id: string }>(items: T[]): Record<string, T> {
  const m: Record<string, T> = {}
  for (const it of items) m[it.id] = it
  return m
}

function floor(id: string, name: string, elements: CanvasElement[]): Floor {
  return {
    id,
    name,
    order: 0,
    elements: toMap(elements),
  }
}

describe('computeUtilizationMetricsByFloor', () => {
  it('groups elements by floor and returns one metrics row per floor', () => {
    const floors: Floor[] = [
      floor('f1', '1F', [desk('d1', 'e1'), desk('d2', null), phoneBooth('pb1')]),
      floor('f2', '2F', [desk('d3', 'e2'), desk('d4', 'e3')]),
    ]
    const employees = toMap([emp('e1'), emp('e2'), emp('e3')])

    const byFloor = computeUtilizationMetricsByFloor(floors, {}, employees)

    expect(Object.keys(byFloor).sort()).toEqual(['f1', 'f2'])
    // Floor 1: 2 desks (1 assigned), 1 phone booth.
    expect(byFloor.f1.totalSeats).toBe(2)
    expect(byFloor.f1.assignedSeats).toBe(1)
    expect(byFloor.f1.phoneBooths).toBe(1)
    // Floor 2: 2 desks both assigned, no phone booth.
    expect(byFloor.f2.totalSeats).toBe(2)
    expect(byFloor.f2.assignedSeats).toBe(2)
    expect(byFloor.f2.phoneBooths).toBe(0)
    // Active-employee denominator is shared across floors.
    expect(byFloor.f1.activeEmployees).toBe(3)
    expect(byFloor.f2.activeEmployees).toBe(3)
  })

  it('returns zeroed metrics for a floor with no elements', () => {
    const floors: Floor[] = [
      floor('f1', '1F', [desk('d1', 'e1')]),
      floor('f2', '2F', []),
    ]
    const employees = toMap([emp('e1')])

    const byFloor = computeUtilizationMetricsByFloor(floors, {}, employees)

    expect(byFloor.f2.totalSeats).toBe(0)
    expect(byFloor.f2.assignedSeats).toBe(0)
    expect(byFloor.f2.phoneBooths).toBe(0)
    expect(byFloor.f2.occupancyRatio).toBe(0)
    // Headcount denominator still tracks — there's 1 active employee.
    expect(byFloor.f2.activeEmployees).toBe(1)
  })

  it('excludes elements in the live override whose id is not on any floor', () => {
    const floors: Floor[] = [floor('f1', '1F', [desk('d1', null)])]
    // `ghost` isn't present in any floor.elements, so we can't attribute it —
    // it must NOT contribute to any floor's metrics.
    const liveOverride = toMap([desk('d1', 'e1'), desk('ghost', 'e2')])
    const employees = toMap([emp('e1'), emp('e2')])

    const byFloor = computeUtilizationMetricsByFloor(floors, liveOverride, employees)

    // The override correctly promotes d1 from unassigned to assigned.
    expect(byFloor.f1.totalSeats).toBe(1)
    expect(byFloor.f1.assignedSeats).toBe(1)
    // `ghost` did not bleed into f1.
    expect(Object.keys(byFloor)).toEqual(['f1'])
  })

  it('returns an empty object when there are no floors', () => {
    const byFloor = computeUtilizationMetricsByFloor([], {}, {})
    expect(byFloor).toEqual({})
  })
})
