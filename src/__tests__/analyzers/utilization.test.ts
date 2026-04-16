import { describe, it, expect } from 'vitest'
import { analyzeUtilization } from '../../lib/analyzers/utilization'
import type { AnalyzerInput } from '../../types/insights'
import type { DeskElement } from '../../types/elements'
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

function makeInput(overrides: Partial<AnalyzerInput> = {}): AnalyzerInput {
  return {
    elements: overrides.elements || [],
    employees: overrides.employees || [],
    zones: overrides.zones || new Map(),
  }
}

describe('analyzeUtilization', () => {
  it('returns empty array when no assignable elements exist', () => {
    const result = analyzeUtilization(makeInput())
    expect(result).toEqual([])
  })

  it('returns critical insight when zone utilization is below 20%', () => {
    const desks = Array.from({ length: 10 }, (_, i) =>
      makeDeskElement({ id: `desk-${i}`, deskId: `D-${i}`, zone: 'Zone A', assignedEmployeeId: i === 0 ? 'emp-1' : null })
    )
    const zones = new Map([['Zone A', desks]])
    const result = analyzeUtilization(makeInput({ elements: desks, zones }))

    expect(result.length).toBeGreaterThanOrEqual(1)
    const zoneInsight = result.find(r => r.category === 'utilization' && r.title.includes('Zone A'))
    expect(zoneInsight).toBeDefined()
    expect(zoneInsight!.severity).toBe('critical')
  })

  it('returns warning insight when zone utilization is below 40%', () => {
    const desks = Array.from({ length: 10 }, (_, i) =>
      makeDeskElement({ id: `desk-${i}`, deskId: `D-${i}`, zone: 'Zone B', assignedEmployeeId: i < 3 ? `emp-${i}` : null })
    )
    const zones = new Map([['Zone B', desks]])
    const result = analyzeUtilization(makeInput({ elements: desks, zones }))

    const zoneInsight = result.find(r => r.title.includes('Zone B'))
    expect(zoneInsight).toBeDefined()
    expect(zoneInsight!.severity).toBe('warning')
  })

  it('returns info insight for overall unassigned desks summary', () => {
    const desks = Array.from({ length: 5 }, (_, i) =>
      makeDeskElement({ id: `desk-${i}`, deskId: `D-${i}`, assignedEmployeeId: i < 3 ? `emp-${i}` : null })
    )
    const result = analyzeUtilization(makeInput({ elements: desks }))

    const summaryInsight = result.find(r => r.category === 'utilization')
    expect(summaryInsight).toBeDefined()
  })
})
