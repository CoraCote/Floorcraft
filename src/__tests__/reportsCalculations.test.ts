import { describe, it, expect } from 'vitest'
import {
  floorUtilization,
  departmentHeadcount,
  unassignedEmployees,
} from '../lib/reports/calculations'
import type { CanvasElement } from '../types/elements'
import type { Employee } from '../types/employee'
import type { Floor } from '../types/floor'

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

describe('floorUtilization', () => {
  it('computes assigned/capacity per floor across desks and workstations', () => {
    const floors: Floor[] = [
      {
        id: 'f1', name: 'Floor 1', order: 0,
        elements: {
          d1: desk('d1', 'e1'),
          d2: desk('d2', null),
          w1: workstation('w1', ['e2', 'e3'], 4),
        },
      } as never,
      {
        id: 'f2', name: 'Floor 2', order: 1,
        elements: { d3: desk('d3', null) },
      } as never,
    ]
    const rows = floorUtilization(floors)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      floorId: 'f1', floorName: 'Floor 1',
      assigned: 3, // 1 desk + 2 workstation seats
      capacity: 6, // 2 desks (1 each) + workstation (4)
    })
    expect(rows[0].percent).toBeCloseTo(50, 0)
    expect(rows[1]).toMatchObject({
      floorId: 'f2', assigned: 0, capacity: 1, percent: 0,
    })
  })

  it('returns percent=0 for a floor with no assignable elements (no divide-by-zero)', () => {
    const floors: Floor[] = [
      { id: 'f1', name: 'Floor 1', order: 0, elements: {} } as never,
    ]
    const rows = floorUtilization(floors)
    expect(rows[0]).toMatchObject({ assigned: 0, capacity: 0, percent: 0 })
  })
})

describe('departmentHeadcount', () => {
  it('counts employees per dept with seat-assignment rate', () => {
    const employees = {
      e1: emp('e1', { department: 'Eng', seatId: 's1' }),
      e2: emp('e2', { department: 'Eng', seatId: null }),
      e3: emp('e3', { department: 'Eng', seatId: 's3' }),
      e4: emp('e4', { department: 'Sales', seatId: 's4' }),
      e5: emp('e5', { department: null, seatId: null }),
    }
    const rows = departmentHeadcount(employees)
    const eng = rows.find((r) => r.department === 'Eng')!
    expect(eng).toMatchObject({ count: 3, assigned: 2 })
    expect(eng.assignmentRate).toBeCloseTo(66.67, 1)
    const sales = rows.find((r) => r.department === 'Sales')!
    expect(sales).toMatchObject({ count: 1, assigned: 1, assignmentRate: 100 })
    const none = rows.find((r) => r.department === '(None)')!
    expect(none.count).toBe(1)
  })

  it('sorts descending by count then alphabetically', () => {
    const employees = {
      a: emp('a', { department: 'Beta' }),
      b: emp('b', { department: 'Alpha' }),
      c: emp('c', { department: 'Alpha' }),
    }
    const rows = departmentHeadcount(employees)
    expect(rows.map((r) => r.department)).toEqual(['Alpha', 'Beta'])
  })
})

describe('unassignedEmployees', () => {
  it('returns active employees without a seat, sorted by name', () => {
    const employees = {
      a: emp('a', { name: 'Carol', status: 'active', seatId: null }),
      b: emp('b', { name: 'Alice', status: 'active', seatId: null }),
      c: emp('c', { name: 'Bob', status: 'active', seatId: 's1' }),
      d: emp('d', { name: 'Dave', status: 'departed', seatId: null }),
    }
    const rows = unassignedEmployees(employees)
    expect(rows.map((r) => r.name)).toEqual(['Alice', 'Carol'])
  })
})
