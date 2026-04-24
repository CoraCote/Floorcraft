import { describe, it, expect } from 'vitest'
import { runAllAnalyzers, buildAnalyzerInput } from '../../lib/analyzers'
import type { CanvasElement, DeskElement } from '../../types/elements'
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
    email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], accommodations: [], sensitivityTags: [], seatId: null, floorId: null,
    status: 'active',
    leaveType: null, expectedReturnDate: null, coverageEmployeeId: null,
    leaveNotes: null, departureDate: null,
    pendingStatusChanges: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('buildAnalyzerInput', () => {
  it('groups elements by zone', () => {
    const elements: CanvasElement[] = [
      makeDeskElement({ id: 'd-1', zone: 'Zone A' }),
      makeDeskElement({ id: 'd-2', zone: 'Zone A' }),
      makeDeskElement({ id: 'd-3', zone: 'Zone B' }),
      makeDeskElement({ id: 'd-4' }), // no zone
    ]

    const input = buildAnalyzerInput(elements, [])
    expect(input.zones.get('Zone A')?.length).toBe(2)
    expect(input.zones.get('Zone B')?.length).toBe(1)
    expect(input.zones.has('undefined')).toBe(false)
  })
})

describe('runAllAnalyzers', () => {
  it('returns an array of insights from all analyzers', () => {
    const elements: CanvasElement[] = [
      makeDeskElement({ id: 'd-1', deskId: 'D-1', zone: 'Zone A' }),
    ]

    const result = runAllAnalyzers(elements, [])
    expect(Array.isArray(result)).toBe(true)
  })

  it('deduplicates insights by id', () => {
    const elements: CanvasElement[] = [
      makeDeskElement({ id: 'd-1', deskId: 'D-1', zone: 'Zone A' }),
    ]
    const employees = [
      makeEmployee({ id: 'e1', tags: ['pending-move'] }),
    ]

    const result = runAllAnalyzers(elements, employees)
    const ids = result.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sorts insights by severity: critical first, then warning, then info', () => {
    const inFiveDays = new Date()
    inFiveDays.setDate(inFiveDays.getDate() + 5)

    const elements: CanvasElement[] = Array.from({ length: 10 }, (_, i) =>
      makeDeskElement({ id: `d-${i}`, deskId: `D-${i}`, zone: 'Zone A', assignedEmployeeId: i === 0 ? 'e-seated' : null })
    )
    const employees = [
      makeEmployee({ id: 'e-new', name: 'New Hire', startDate: inFiveDays.toISOString(), seatId: null }),
      makeEmployee({ id: 'e-move', name: 'Mover', tags: ['pending-move'] }),
    ]

    const result = runAllAnalyzers(elements, employees)
    const severityOrder = { critical: 0, warning: 1, info: 2 }

    for (let i = 1; i < result.length; i++) {
      expect(severityOrder[result[i].severity]).toBeGreaterThanOrEqual(
        severityOrder[result[i - 1].severity]
      )
    }
  })
})
