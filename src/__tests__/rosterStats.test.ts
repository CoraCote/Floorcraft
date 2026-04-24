import { describe, it, expect } from 'vitest'
import { computeRosterStats } from '../lib/rosterStats'
import type { Employee } from '../types/employee'
import type { CanvasElement } from '../types/elements'

/**
 * Minimal employee factory — only the fields the helper actually reads
 * (`floorId`, `seatId`) need to be meaningful; the rest are filled with
 * type-correct defaults so `Employee`'s required-field invariant holds.
 */
function emp(
  id: string,
  patch: Partial<Pick<Employee, 'floorId' | 'seatId'>>,
): Employee {
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
    createdAt: new Date().toISOString(),
    ...patch,
  }
}

/**
 * Minimal desk factory. Mirrors the shape used by `statusBar.test.tsx`
 * — only `type`, `assignedEmployeeId`, and the bookkeeping fields the
 * type guard expects are populated.
 */
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
    deskId: id,
    assignedEmployeeId: assigned,
    capacity: 1,
  } as unknown as CanvasElement
}

describe('computeRosterStats', () => {
  it('returns total/visible equal to employees.length when no floor filter is supplied', () => {
    const employees = [
      emp('a', { seatId: 's1', floorId: 'f1' }),
      emp('b', { seatId: null, floorId: null }),
      emp('c', { seatId: 's2', floorId: 'f2' }),
    ]
    const elements = { d1: desk('d1', 'a'), d2: desk('d2', null) }
    const stats = computeRosterStats(employees, elements)
    expect(stats.total).toBe(3)
    expect(stats.visible).toBe(3)
    expect(stats.unassigned).toBe(1) // only `b`
    expect(stats.occupancyPct).toBe(50) // 1 of 2 desks
  })

  it('narrows visible/unassigned to a floor when floorFilter is set', () => {
    const employees = [
      emp('a', { seatId: 's1', floorId: 'f1' }),
      emp('b', { seatId: null, floorId: 'f1' }),
      emp('c', { seatId: 's2', floorId: 'f2' }),
      emp('d', { seatId: null, floorId: null }),
    ]
    const elements = { d1: desk('d1', 'a'), d2: desk('d2', 'c') }
    const stats = computeRosterStats(employees, elements, 'f1')
    expect(stats.total).toBe(4) // total stays global
    expect(stats.visible).toBe(2) // `a` + `b`
    expect(stats.unassigned).toBe(1) // just `b` on f1
    expect(stats.occupancyPct).toBe(100) // unchanged — both desks assigned
  })

  it('returns 0 occupancy when there are no desks (avoids NaN)', () => {
    const stats = computeRosterStats([emp('a', {})], {})
    expect(stats.total).toBe(1)
    expect(stats.visible).toBe(1)
    expect(stats.unassigned).toBe(1)
    expect(stats.occupancyPct).toBe(0)
  })

  it('handles an empty roster cleanly', () => {
    const stats = computeRosterStats([], { d1: desk('d1', null) })
    expect(stats.total).toBe(0)
    expect(stats.visible).toBe(0)
    expect(stats.unassigned).toBe(0)
    expect(stats.occupancyPct).toBe(0)
  })
})
