import { describe, it, expect } from 'vitest'
import { analyzeTeamProximity } from '../../lib/analyzers/proximity'
import type { AnalyzerInput } from '../../types/insights'
import type { DeskElement } from '../../types/elements'
import type { Employee } from '../../types/employee'

function makeDeskElement(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: overrides.id || 'desk-1',
    type: 'desk',
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Desk', visible: true,
    style: { fill: '#FEF3C7', stroke: '#D97706', strokeWidth: 1, opacity: 1 },
    deskId: overrides.deskId || 'D-101',
    assignedEmployeeId: overrides.assignedEmployeeId ?? null,
    capacity: 1,
    zone: overrides.zone,
    ...overrides,
  } as DeskElement
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: overrides.department ?? null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], seatId: overrides.seatId ?? null, floorId: overrides.floorId ?? null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('analyzeTeamProximity', () => {
  it('returns empty array when no employees have departments', () => {
    const result = analyzeTeamProximity({
      elements: [],
      employees: [makeEmployee({ department: null })],
      zones: new Map(),
    })
    expect(result).toEqual([])
  })

  it('returns warning when a department is split across 2+ zones', () => {
    const desks = [
      makeDeskElement({ id: 'd-1', deskId: 'D-1', zone: 'Zone A', assignedEmployeeId: 'emp-1' }),
      makeDeskElement({ id: 'd-2', deskId: 'D-2', zone: 'Zone A', assignedEmployeeId: 'emp-2' }),
      makeDeskElement({ id: 'd-3', deskId: 'D-3', zone: 'Zone B', assignedEmployeeId: 'emp-3' }),
    ]
    const employees = [
      makeEmployee({ id: 'emp-1', department: 'Engineering', seatId: 'D-1' }),
      makeEmployee({ id: 'emp-2', department: 'Engineering', seatId: 'D-2' }),
      makeEmployee({ id: 'emp-3', department: 'Engineering', seatId: 'D-3' }),
    ]
    const zones = new Map([
      ['Zone A', [desks[0], desks[1]]],
      ['Zone B', [desks[2]]],
    ])

    const result = analyzeTeamProximity({ elements: desks, employees, zones })

    const splitInsight = result.find(r => r.title.includes('Engineering'))
    expect(splitInsight).toBeDefined()
    expect(splitInsight!.severity).toBe('warning')
    expect(splitInsight!.narrative).toContain('Zone A')
    expect(splitInsight!.narrative).toContain('Zone B')
  })

  it('returns no insight when department is in a single zone', () => {
    const desks = [
      makeDeskElement({ id: 'd-1', deskId: 'D-1', zone: 'Zone A', assignedEmployeeId: 'emp-1' }),
      makeDeskElement({ id: 'd-2', deskId: 'D-2', zone: 'Zone A', assignedEmployeeId: 'emp-2' }),
    ]
    const employees = [
      makeEmployee({ id: 'emp-1', department: 'Engineering', seatId: 'D-1' }),
      makeEmployee({ id: 'emp-2', department: 'Engineering', seatId: 'D-2' }),
    ]
    const zones = new Map([['Zone A', desks]])

    const result = analyzeTeamProximity({ elements: desks, employees, zones })
    expect(result).toEqual([])
  })
})
