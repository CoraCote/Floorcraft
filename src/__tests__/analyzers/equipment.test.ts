import { describe, it, expect } from 'vitest'
import { analyzeEquipment } from '../../lib/analyzers/equipment'
import type { Employee } from '../../types/employee'

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
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('analyzeEquipment', () => {
  it('returns warning for seated employees with pending equipment', () => {
    const result = analyzeEquipment({
      elements: [],
      employees: [
        makeEmployee({
          id: 'e1', name: 'Jane',
          seatId: 'D-101',
          equipmentNeeds: ['monitor', 'standing-desk'],
          equipmentStatus: 'pending',
        }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('warning')
    expect(result[0].narrative).toContain('monitor')
    expect(result[0].narrative).toContain('standing-desk')
  })

  it('returns info for unassigned employees with pending equipment', () => {
    const result = analyzeEquipment({
      elements: [],
      employees: [
        makeEmployee({
          id: 'e1', name: 'John',
          seatId: null,
          equipmentNeeds: ['docking-station'],
          equipmentStatus: 'pending',
        }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('info')
  })

  it('returns no insight for provisioned employees', () => {
    const result = analyzeEquipment({
      elements: [],
      employees: [
        makeEmployee({
          equipmentNeeds: ['monitor'],
          equipmentStatus: 'provisioned',
          seatId: 'D-101',
        }),
      ],
      zones: new Map(),
    })

    expect(result).toEqual([])
  })

  it('returns aggregate insight when multiple employees have pending equipment', () => {
    const result = analyzeEquipment({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'A', seatId: 'D-1', equipmentNeeds: ['monitor'], equipmentStatus: 'pending' }),
        makeEmployee({ id: 'e2', name: 'B', seatId: 'D-2', equipmentNeeds: ['monitor'], equipmentStatus: 'pending' }),
        makeEmployee({ id: 'e3', name: 'C', seatId: 'D-3', equipmentNeeds: ['keyboard'], equipmentStatus: 'pending' }),
      ],
      zones: new Map(),
    })

    // Should have individual insights + potentially an aggregate
    expect(result.length).toBeGreaterThanOrEqual(3)
  })
})
