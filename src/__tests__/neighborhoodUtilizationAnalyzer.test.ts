import { describe, it, expect } from 'vitest'
import { analyzeNeighborhoodUtilization } from '../lib/analyzers/neighborhoodUtilization'
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

function nb(over: Partial<Neighborhood> = {}): Neighborhood {
  return {
    id: 'n1',
    name: 'Pod A',
    color: '#3B82F6',
    x: 100,
    y: 100,
    width: 400,
    height: 400,
    floorId: 'floor-1',
    ...over,
  }
}

function toMap<T extends { id: string }>(items: T[]): Record<string, T> {
  const m: Record<string, T> = {}
  for (const it of items) m[it.id] = it
  return m
}

describe('analyzeNeighborhoodUtilization', () => {
  it('emits nothing when there are no neighborhoods', () => {
    const insights = analyzeNeighborhoodUtilization([], {}, {})
    expect(insights).toEqual([])
  })

  it('skips neighborhoods with no seats inside them', () => {
    // A neighborhood with nothing assignable inside is a placement issue,
    // not an occupancy one — silence the analyzer.
    const insights = analyzeNeighborhoodUtilization([nb()], {}, {})
    expect(insights).toEqual([])
  })

  it('emits a warning at >95% occupancy', () => {
    // 20 desks, 20 assigned = 100% (>95%).
    const desks = Array.from({ length: 20 }, (_, i) =>
      desk(`d${i}`, 100 + i, 100 + i, `e${i}`),
    )
    const employees = toMap(desks.map((_, i) => emp(`e${i}`)))
    const insights = analyzeNeighborhoodUtilization(
      [nb()],
      toMap(desks),
      employees,
    )
    expect(insights).toHaveLength(1)
    expect(insights[0].category).toBe('capacity')
    expect(insights[0].severity).toBe('warning')
    expect(insights[0].id).toBe('neighborhood-capacity-over-n1')
    expect(insights[0].title).toMatch(/Pod A at 100% occupancy/)
    // All contained assignable element ids come through so "View on map"
    // can focus the zone.
    expect(insights[0].relatedElementIds.sort()).toEqual(
      desks.map((d) => d.id).sort(),
    )
  })

  it('emits an info at <20% occupancy', () => {
    // 10 desks, 1 assigned = 10% (<20%).
    const desks = Array.from({ length: 10 }, (_, i) =>
      desk(`d${i}`, 100 + i, 100 + i, i === 0 ? 'e0' : null),
    )
    const insights = analyzeNeighborhoodUtilization(
      [nb()],
      toMap(desks),
      toMap([emp('e0')]),
    )
    expect(insights).toHaveLength(1)
    expect(insights[0].category).toBe('capacity')
    expect(insights[0].severity).toBe('info')
    expect(insights[0].id).toBe('neighborhood-capacity-under-n1')
    expect(insights[0].title).toMatch(/Pod A at 10% occupancy/)
  })

  it('stays silent in the healthy band (20-95%)', () => {
    // 10 desks, 5 assigned = 50% — well inside the silent band.
    const desks = Array.from({ length: 10 }, (_, i) =>
      desk(`d${i}`, 100 + i, 100 + i, i < 5 ? `e${i}` : null),
    )
    const employees = toMap(
      Array.from({ length: 5 }, (_, i) => emp(`e${i}`)),
    )
    const insights = analyzeNeighborhoodUtilization(
      [nb()],
      toMap(desks),
      employees,
    )
    expect(insights).toEqual([])
  })

  it('stays silent at exactly 20% and 95% (strict inequality)', () => {
    // 20 desks at exactly 20% (4/20) — under-threshold is strict <20,
    // so this should not fire.
    const desks20 = Array.from({ length: 20 }, (_, i) =>
      desk(`d${i}`, 100 + i, 100 + i, i < 4 ? `e${i}` : null),
    )
    const employees20 = toMap(Array.from({ length: 4 }, (_, i) => emp(`e${i}`)))
    expect(
      analyzeNeighborhoodUtilization([nb()], toMap(desks20), employees20),
    ).toEqual([])

    // 20 desks at exactly 95% (19/20) — over-threshold is strict >95,
    // so this should also stay silent.
    const desks95 = Array.from({ length: 20 }, (_, i) =>
      desk(`d${i}`, 100 + i, 100 + i, i < 19 ? `e${i}` : null),
    )
    const employees95 = toMap(
      Array.from({ length: 19 }, (_, i) => emp(`e${i}`)),
    )
    expect(
      analyzeNeighborhoodUtilization([nb()], toMap(desks95), employees95),
    ).toEqual([])
  })

  it('emits independent insights per neighborhood', () => {
    // Two non-overlapping zones: one over-full, one empty.
    const nbFull = nb({ id: 'full', name: 'Full Pod', x: 100, y: 100 })
    const nbEmpty = nb({
      id: 'empty',
      name: 'Empty Pod',
      x: 2000,
      y: 2000,
    })
    const elements = toMap([
      // 10 inside Full, all assigned → 100% → warning
      ...Array.from({ length: 10 }, (_, i) =>
        desk(`f${i}`, 100 + i, 100 + i, `e${i}`),
      ),
      // 10 inside Empty, 0 assigned → 0% → info
      ...Array.from({ length: 10 }, (_, i) =>
        desk(`e${i}`, 2000 + i, 2000 + i, null),
      ),
    ])
    const employees = toMap(
      Array.from({ length: 10 }, (_, i) => emp(`e${i}`)),
    )
    const insights = analyzeNeighborhoodUtilization(
      [nbFull, nbEmpty],
      elements,
      employees,
    )
    expect(insights).toHaveLength(2)
    const byId = Object.fromEntries(insights.map((i) => [i.id, i]))
    expect(byId['neighborhood-capacity-over-full'].severity).toBe('warning')
    expect(byId['neighborhood-capacity-under-empty'].severity).toBe('info')
  })
})
