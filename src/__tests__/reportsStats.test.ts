import { describe, it, expect } from 'vitest'
import { computeReportsStats } from '../lib/reportsStats'
import type { Employee } from '../types/employee'
import type { CanvasElement } from '../types/elements'

function emp(
  id: string,
  overrides: Partial<Employee> = {},
): Employee {
  return {
    id,
    name: id,
    department: 'Eng',
    status: 'active',
    seatId: null,
    email: '',
    officeDays: [],
    equipmentNeeds: [],
    tags: [],
    employmentType: 'full-time',
    ...overrides,
  } as unknown as Employee
}

function desk(id: string, assigned: string | null = null): CanvasElement {
  return {
    id,
    type: 'desk',
    deskId: id,
    assignedEmployeeId: assigned,
    capacity: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
  } as unknown as CanvasElement
}

function workstation(id: string, positions: number, assigned: string[]): CanvasElement {
  const padded: Array<string | null> = Array.from({ length: positions }, (_, i) =>
    i < assigned.length ? assigned[i] : null,
  )
  return {
    id,
    type: 'workstation',
    positions,
    assignedEmployeeIds: padded,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
  } as unknown as CanvasElement
}

function office(id: string, capacity: number, assigned: string[]): CanvasElement {
  return {
    id,
    type: 'private-office',
    capacity,
    assignedEmployeeIds: assigned,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
  } as unknown as CanvasElement
}

describe('computeReportsStats', () => {
  it('returns zeros on an empty project', () => {
    const stats = computeReportsStats({}, [])
    expect(stats).toEqual({
      totalEmployees: 0,
      unassigned: 0,
      totalSeats: 0,
      occupancyPct: 0,
      floorCount: 0,
      departmentCount: 0,
    })
  })

  it('aggregates employees, seats, and departments across floors', () => {
    const employees: Record<string, Employee> = {
      e1: emp('e1', { department: 'Eng', seatId: 'd1' }),
      e2: emp('e2', { department: 'Eng', seatId: null }),
      e3: emp('e3', { department: 'Sales', seatId: 'ws1' }),
      e4: emp('e4', { department: 'Sales', seatId: 'ws1' }),
      e5: emp('e5', { department: '', seatId: null }),
    }
    const floors: Array<{ floorId: string; elements: Record<string, CanvasElement> }> = [
      {
        floorId: 'f1',
        elements: {
          d1: desk('d1', 'e1'),
          d2: desk('d2'),
        },
      },
      {
        floorId: 'f2',
        elements: {
          ws1: workstation('ws1', 4, ['e3', 'e4']),
          po1: office('po1', 2, []),
        },
      },
    ]

    const stats = computeReportsStats(employees, floors)

    // 5 total employees, 2 without seatId (e2, e5).
    expect(stats.totalEmployees).toBe(5)
    expect(stats.unassigned).toBe(2)

    // Seats = 2 desks + 4 workstation positions + 2 private-office cap = 8.
    expect(stats.totalSeats).toBe(8)

    // Occupancy: 1 desk assigned + 2 ws assigned + 0 office = 3 / 8 = 37.5 -> 38
    expect(stats.occupancyPct).toBe(38)

    expect(stats.floorCount).toBe(2)
    // Distinct non-empty departments: Eng, Sales (empty string dropped).
    expect(stats.departmentCount).toBe(2)
  })

  it('ignores empty or whitespace department names', () => {
    const employees: Record<string, Employee> = {
      e1: emp('e1', { department: '  ' }),
      e2: emp('e2', { department: '' }),
      e3: emp('e3', { department: 'Ops' }),
    }
    const stats = computeReportsStats(employees, [])
    expect(stats.departmentCount).toBe(1)
  })
})
