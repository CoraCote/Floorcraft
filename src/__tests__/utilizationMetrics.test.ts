import { describe, it, expect } from 'vitest'
import {
  computeUtilizationMetrics,
  occupancyHealth,
  meetingSeatsHealth,
  phoneBoothHealth,
} from '../lib/utilizationMetrics'
import type { CanvasElement } from '../types/elements'
import type { Employee } from '../types/employee'

// Factory helpers — mirror the shape `reportsCalculations.test.ts` uses so
// the data fixtures stay consistent across the test suite.

function emp(id: string, over: Partial<Employee> = {}): Employee {
  return {
    id, name: id, email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', status: 'active',
    officeDays: [], startDate: null, endDate: null,
    equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null,
    tags: [], seatId: null, floorId: null,
    createdAt: new Date().toISOString(),
    leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
    leaveNotes: null, departureDate: null,
    ...over,
  } as Employee
}

function desk(id: string, assigned: string | null): CanvasElement {
  return {
    id, type: 'desk', x: 0, y: 0, width: 60, height: 60, rotation: 0,
    locked: false, groupId: null, zIndex: 0, visible: true, label: '',
    deskId: id, assignedEmployeeId: assigned, capacity: 1,
  } as unknown as CanvasElement
}

function workstation(id: string, assigned: string[], positions: number): CanvasElement {
  return {
    id, type: 'workstation', x: 0, y: 0, width: 120, height: 60, rotation: 0,
    locked: false, groupId: null, zIndex: 0, visible: true, label: '',
    deskId: id, positions, assignedEmployeeIds: assigned,
  } as unknown as CanvasElement
}

function privateOffice(id: string, assigned: string[], capacity: 1 | 2): CanvasElement {
  return {
    id, type: 'private-office', x: 0, y: 0, width: 120, height: 120, rotation: 0,
    locked: false, groupId: null, zIndex: 0, visible: true, label: '',
    deskId: id, assignedEmployeeIds: assigned, capacity,
  } as unknown as CanvasElement
}

function conferenceRoom(id: string, capacity: number): CanvasElement {
  return {
    id, type: 'conference-room', x: 0, y: 0, width: 200, height: 120, rotation: 0,
    locked: false, groupId: null, zIndex: 0, visible: true, label: '',
    roomName: 'Room', capacity,
  } as unknown as CanvasElement
}

function phoneBooth(id: string): CanvasElement {
  return {
    id, type: 'phone-booth', x: 0, y: 0, width: 40, height: 40, rotation: 0,
    locked: false, groupId: null, zIndex: 0, visible: true, label: '',
  } as unknown as CanvasElement
}

function commonArea(id: string): CanvasElement {
  return {
    id, type: 'common-area', x: 0, y: 0, width: 100, height: 100, rotation: 0,
    locked: false, groupId: null, zIndex: 0, visible: true, label: '',
    areaName: 'Kitchen',
  } as unknown as CanvasElement
}

function toMap<T extends { id: string }>(items: T[]): Record<string, T> {
  const m: Record<string, T> = {}
  for (const it of items) m[it.id] = it
  return m
}

describe('computeUtilizationMetrics', () => {
  it('returns an all-zero metrics object for empty input', () => {
    const m = computeUtilizationMetrics({}, {})
    expect(m.totalSeats).toBe(0)
    expect(m.occupancyRatio).toBe(0)
    expect(m.activeEmployees).toBe(0)
  })

  it('aggregates desks, workstations, and private offices into totalSeats', () => {
    const elements = toMap([
      desk('d1', null),
      desk('d2', 'e1'),
      workstation('w1', ['e2', 'e3'], 4),   // 4 positions, 2 assigned
      privateOffice('p1', ['e4'], 2),        // capacity 2, 1 assigned — full seats counted
    ])
    const m = computeUtilizationMetrics(elements, {})
    expect(m.totalSeats).toBe(1 + 1 + 4 + 2)
    expect(m.assignedSeats).toBe(0 + 1 + 2 + 1)
    expect(m.occupancyRatio).toBeCloseTo(4 / 8, 5)
  })

  it('divides by zero safely when there are no seats', () => {
    const m = computeUtilizationMetrics({}, toMap([emp('e1')]))
    expect(m.occupancyRatio).toBe(0)
    expect(m.seatsPerPerson).toBe(0) // no seats / 1 person still 0
  })

  it('excludes departed employees from active headcount', () => {
    const m = computeUtilizationMetrics(
      {},
      toMap([emp('a', { status: 'active' }), emp('b', { status: 'departed' }), emp('c', { status: 'on-leave' })]),
    )
    // Active = everyone not departed, so on-leave counts as active too.
    expect(m.activeEmployees).toBe(2)
  })

  it('sums conference-room capacities into meetingRoomSeats', () => {
    const elements = toMap([conferenceRoom('c1', 8), conferenceRoom('c2', 4)])
    const m = computeUtilizationMetrics(elements, toMap([emp('e1'), emp('e2')]))
    expect(m.meetingRoomSeats).toBe(12)
    expect(m.meetingSeatsPerPerson).toBe(6) // 12 seats / 2 people
  })

  it('counts phone booths and common areas as discrete elements', () => {
    const elements = toMap([phoneBooth('pb1'), phoneBooth('pb2'), commonArea('ca1')])
    const m = computeUtilizationMetrics(elements, toMap([emp('e1'), emp('e2'), emp('e3'), emp('e4')]))
    expect(m.phoneBooths).toBe(2)
    expect(m.commonAreas).toBe(1)
    expect(m.phoneBoothsPerPerson).toBeCloseTo(0.5, 5)
  })
})

describe('health buckets', () => {
  it('occupancyHealth flags under-use and over-use as critical', () => {
    expect(occupancyHealth(0.0, 10)).toBe('critical') // bone-dry
    expect(occupancyHealth(0.5, 10)).toBe('warn')     // below healthy band
    expect(occupancyHealth(0.75, 10)).toBe('healthy') // sweet spot
    expect(occupancyHealth(0.92, 10)).toBe('warn')    // tight
    expect(occupancyHealth(0.98, 10)).toBe('critical')// no flex at all
    expect(occupancyHealth(0, 0)).toBe('unknown')     // no data → don't colour
  })

  it('meetingSeatsHealth surfaces rooms-desert offices', () => {
    expect(meetingSeatsHealth(0.02, 100)).toBe('critical')
    expect(meetingSeatsHealth(0.08, 100)).toBe('warn')
    expect(meetingSeatsHealth(0.20, 100)).toBe('healthy')
    expect(meetingSeatsHealth(0.40, 100)).toBe('warn') // over-provisioned
    expect(meetingSeatsHealth(0, 0)).toBe('unknown')
  })

  it('phoneBoothHealth warns when coverage is thin', () => {
    expect(phoneBoothHealth(0, 100)).toBe('critical')
    expect(phoneBoothHealth(0.015, 100)).toBe('warn')
    expect(phoneBoothHealth(0.04, 100)).toBe('healthy')
    expect(phoneBoothHealth(0, 0)).toBe('unknown')
  })
})
