import { describe, it, expect } from 'vitest'
import {
  computeNeighborhoodMetrics,
  neighborhoodOccupancyHealth,
} from '../lib/neighborhoodMetrics'
import type { CanvasElement } from '../types/elements'
import type { Employee } from '../types/employee'
import type { Neighborhood } from '../types/neighborhood'

function emp(id: string, over: Partial<Employee> = {}): Employee {
  return {
    id,
    name: id,
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
    pendingStatusChanges: [],
    seatId: null,
    floorId: null,
    createdAt: '2025-01-01',
    ...over,
  }
}

function desk(
  id: string,
  x: number,
  y: number,
  assigned: string | null,
): CanvasElement {
  return {
    id,
    type: 'desk',
    x,
    y,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    deskId: `D-${id}`,
    assignedEmployeeId: assigned,
    capacity: 1,
  } as unknown as CanvasElement
}

function workstation(
  id: string,
  x: number,
  y: number,
  assigned: string[],
  positions: number,
): CanvasElement {
  return {
    id,
    type: 'workstation',
    x,
    y,
    width: 120,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    deskId: `D-${id}`,
    positions,
    // Sparse positional contract — pad with nulls to length === positions.
    assignedEmployeeIds: Array.from({ length: positions }, (_, i) =>
      i < assigned.length ? assigned[i] : null,
    ),
  } as unknown as CanvasElement
}

function nb(over: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: 'n1',
    name: 'Pod A',
    color: '#3B82F6',
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    floorId: 'floor-1',
    ...over,
  }
}

function toMap<T extends { id: string }>(items: T[]): Record<string, T> {
  const m: Record<string, T> = {}
  for (const it of items) m[it.id] = it
  return m
}

describe('computeNeighborhoodMetrics', () => {
  it('returns an empty list when there are no neighborhoods', () => {
    const out = computeNeighborhoodMetrics([], {}, {})
    expect(out).toEqual([])
  })

  it('returns a zero-seats metric when no seats fall inside a neighborhood', () => {
    const out = computeNeighborhoodMetrics([nb()], {}, {})
    expect(out).toHaveLength(1)
    expect(out[0].totalSeats).toBe(0)
    expect(out[0].assignedSeats).toBe(0)
    expect(out[0].occupancyRatio).toBe(0)
    expect(out[0].health).toBe('unknown')
  })

  it('counts a fully-empty neighborhood at 0% with critical health', () => {
    const elements = toMap([
      desk('a', 100, 100, null),
      desk('b', 120, 120, null),
    ])
    const out = computeNeighborhoodMetrics([nb()], elements, {})
    expect(out[0].totalSeats).toBe(2)
    expect(out[0].assignedSeats).toBe(0)
    expect(out[0].occupancyRatio).toBe(0)
    // 0% falls under the < 0.3 threshold — critical, not unknown, because
    // totalSeats > 0.
    expect(out[0].health).toBe('critical')
  })

  it('computes a 50% half-occupied neighborhood with warn health', () => {
    const elements = toMap([
      desk('a', 50, 50, 'e1'),
      desk('b', 60, 60, 'e2'),
      desk('c', 120, 120, null),
      desk('d', 140, 140, null),
    ])
    const out = computeNeighborhoodMetrics(
      [nb()],
      elements,
      toMap([emp('e1'), emp('e2')]),
    )
    expect(out[0].totalSeats).toBe(4)
    expect(out[0].assignedSeats).toBe(2)
    expect(out[0].occupancyRatio).toBeCloseTo(0.5, 5)
    expect(out[0].health).toBe('warn')
  })

  it('computes a 100% full neighborhood as critical (over-threshold)', () => {
    const elements = toMap([
      desk('a', 100, 100, 'e1'),
      desk('b', 120, 120, 'e2'),
    ])
    const out = computeNeighborhoodMetrics(
      [nb()],
      elements,
      toMap([emp('e1'), emp('e2')]),
    )
    expect(out[0].totalSeats).toBe(2)
    expect(out[0].assignedSeats).toBe(2)
    expect(out[0].occupancyRatio).toBe(1)
    expect(out[0].health).toBe('critical')
  })

  it('sums workstation positions and assignments correctly', () => {
    const elements = toMap([
      workstation('w1', 100, 100, ['e1', 'e2'], 4),
    ])
    const out = computeNeighborhoodMetrics(
      [nb()],
      elements,
      toMap([emp('e1'), emp('e2')]),
    )
    expect(out[0].totalSeats).toBe(4)
    expect(out[0].assignedSeats).toBe(2)
  })

  it('handles multiple neighborhoods with independent rollups', () => {
    // Two non-overlapping zones, each with its own seats.
    const nbA = nb({ id: 'a', name: 'A', x: 100, y: 100, width: 100, height: 100 })
    const nbB = nb({ id: 'b', name: 'B', x: 500, y: 500, width: 100, height: 100 })
    const elements = toMap([
      desk('d1', 100, 100, 'e1'), // inside A
      desk('d2', 110, 110, null), // inside A
      desk('d3', 500, 500, 'e2'), // inside B
    ])
    const out = computeNeighborhoodMetrics(
      [nbA, nbB],
      elements,
      toMap([emp('e1'), emp('e2')]),
    )
    const byId = Object.fromEntries(out.map((m) => [m.neighborhoodId, m]))
    expect(byId.a.totalSeats).toBe(2)
    expect(byId.a.assignedSeats).toBe(1)
    expect(byId.a.occupancyRatio).toBeCloseTo(0.5, 5)
    expect(byId.b.totalSeats).toBe(1)
    expect(byId.b.assignedSeats).toBe(1)
    expect(byId.b.occupancyRatio).toBe(1)
  })

  it('ignores seats that fall outside every neighborhood', () => {
    const elements = toMap([
      desk('d1', 100, 100, 'e1'), // inside
      desk('d2', 900, 900, 'e2'), // way outside
    ])
    const out = computeNeighborhoodMetrics(
      [nb()],
      elements,
      toMap([emp('e1'), emp('e2')]),
    )
    expect(out[0].totalSeats).toBe(1)
    expect(out[0].assignedSeats).toBe(1)
  })

  it('carries through name, color, floorId, and ids for downstream use', () => {
    const elements = toMap([desk('d1', 100, 100, null)])
    const out = computeNeighborhoodMetrics(
      [nb({ name: 'Eng Pod', color: '#EF4444', floorId: 'floor-7' })],
      elements,
      {},
    )
    expect(out[0].name).toBe('Eng Pod')
    expect(out[0].color).toBe('#EF4444')
    expect(out[0].floorId).toBe('floor-7')
    expect(out[0].elementIds).toEqual(['d1'])
  })
})

describe('neighborhoodOccupancyHealth', () => {
  it('returns unknown when there are no seats', () => {
    expect(neighborhoodOccupancyHealth(0, 0)).toBe('unknown')
  })

  it('flags 0% and 100% as critical', () => {
    expect(neighborhoodOccupancyHealth(0, 10)).toBe('critical')
    expect(neighborhoodOccupancyHealth(1, 10)).toBe('critical')
  })

  it('buckets mid-range as warn or healthy against the thresholds', () => {
    expect(neighborhoodOccupancyHealth(0.5, 10)).toBe('warn')
    expect(neighborhoodOccupancyHealth(0.75, 10)).toBe('healthy')
    expect(neighborhoodOccupancyHealth(0.92, 10)).toBe('warn')
  })
})
