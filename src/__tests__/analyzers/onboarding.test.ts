import { describe, it, expect } from 'vitest'
import { analyzeOnboarding } from '../../lib/analyzers/onboarding'
import type { Employee } from '../../types/employee'

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id || 'emp-1',
    name: overrides.name || 'Test Employee',
    email: '', department: null, team: null, title: null,
    managerId: null, employmentType: 'full-time', officeDays: [],
    startDate: null, endDate: null, equipmentNeeds: [], equipmentStatus: 'not-needed',
    photoUrl: null, tags: [], seatId: null, floorId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('analyzeOnboarding', () => {
  it('returns critical for new hire within 7 days with no seat', () => {
    const inFiveDays = new Date()
    inFiveDays.setDate(inFiveDays.getDate() + 5)

    const result = analyzeOnboarding({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'Sarah Chen', startDate: inFiveDays.toISOString(), seatId: null }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('critical')
    expect(result[0].title).toContain('Sarah Chen')
  })

  it('returns warning for new hire within 30 days with no seat', () => {
    const inTwentyDays = new Date()
    inTwentyDays.setDate(inTwentyDays.getDate() + 20)

    const result = analyzeOnboarding({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'Mike Torres', startDate: inTwentyDays.toISOString(), seatId: null }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('warning')
  })

  it('returns info for departed employee still assigned a seat', () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const result = analyzeOnboarding({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', name: 'Former Employee', endDate: thirtyDaysAgo.toISOString(), seatId: 'D-101' }),
      ],
      zones: new Map(),
    })

    expect(result.length).toBe(1)
    expect(result[0].severity).toBe('info')
    expect(result[0].title).toContain('Former Employee')
  })

  it('returns no insight for new hire who already has a seat', () => {
    const inFiveDays = new Date()
    inFiveDays.setDate(inFiveDays.getDate() + 5)

    const result = analyzeOnboarding({
      elements: [],
      employees: [
        makeEmployee({ id: 'e1', startDate: inFiveDays.toISOString(), seatId: 'D-101' }),
      ],
      zones: new Map(),
    })

    expect(result).toEqual([])
  })
})
