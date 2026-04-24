import { describe, it, expect } from 'vitest'
import { redactEmployee, toInitials, redactEmployeeMap } from '../lib/redactEmployee'
import type { Employee } from '../types/employee'

function buildEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'e1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    department: 'Engineering',
    team: 'Core',
    title: 'Staff Eng',
    managerId: 'm1',
    employmentType: 'full-time',
    status: 'active',
    officeDays: ['Mon', 'Tue', 'Wed'],
    startDate: '2024-01-15',
    endDate: '2025-01-15',
    leaveType: null,
    expectedReturnDate: '2025-02-01',
    coverageEmployeeId: 'c1',
    leaveNotes: 'back in Feb',
    departureDate: '2026-01-01',
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    photoUrl: 'https://example.com/p.jpg',
    tags: ['vip', 'visa-sponsored'],
    seatId: 'desk-1',
    floorId: 'f1',
    createdAt: '2024-01-01T00:00:00.000Z',
    accommodations: [],
    pendingStatusChanges: [],
    ...overrides,
  }
}

describe('toInitials', () => {
  it('collapses two-word names to two dotted initials', () => {
    expect(toInitials('Jane Doe')).toBe('J.D.')
  })

  it('handles three-word names (middle name / compound)', () => {
    expect(toInitials('Maria Elena Cruz')).toBe('M.E.C.')
  })

  it('returns a single dotted initial for one-word names', () => {
    expect(toInitials('Alice')).toBe('A.')
  })

  it('uppercases lowercase input letters', () => {
    expect(toInitials('alice bob')).toBe('A.B.')
  })

  it('falls back to "?" for empty string', () => {
    expect(toInitials('')).toBe('?')
  })

  it('falls back to "?" for whitespace-only input', () => {
    expect(toInitials('   ')).toBe('?')
  })

  it('collapses runs of interior whitespace', () => {
    expect(toInitials('Jane    Doe')).toBe('J.D.')
  })
})

describe('redactEmployee', () => {
  it('blanks every PII field', () => {
    const r = redactEmployee(buildEmployee())
    expect(r.name).toBe('J.D.')
    expect(r.email).toBe('')
    expect(r.managerId).toBeNull()
    expect(r.startDate).toBeNull()
    expect(r.endDate).toBeNull()
    expect(r.departureDate).toBeNull()
    expect(r.expectedReturnDate).toBeNull()
    expect(r.coverageEmployeeId).toBeNull()
    expect(r.leaveNotes).toBeNull()
    expect(r.photoUrl).toBeNull()
    expect(r.tags).toEqual([])
    expect(r.officeDays).toEqual([])
  })

  it('preserves structural / planning fields that are not PII', () => {
    const e = buildEmployee()
    const r = redactEmployee(e)
    expect(r.id).toBe(e.id)
    expect(r.department).toBe(e.department)
    expect(r.team).toBe(e.team)
    expect(r.title).toBe(e.title)
    expect(r.employmentType).toBe(e.employmentType)
    expect(r.status).toBe(e.status)
    expect(r.seatId).toBe(e.seatId)
    expect(r.floorId).toBe(e.floorId)
    expect(r.equipmentStatus).toBe(e.equipmentStatus)
    expect(r.createdAt).toBe(e.createdAt)
  })

  it('does not mutate the input employee', () => {
    const e = buildEmployee()
    const snapshot = JSON.parse(JSON.stringify(e))
    redactEmployee(e)
    expect(e).toEqual(snapshot)
  })
})

describe('redactEmployeeMap', () => {
  it('preserves keys and redacts every value', () => {
    const map: Record<string, Employee> = {
      a: buildEmployee({ id: 'a', name: 'Alice Smith' }),
      b: buildEmployee({ id: 'b', name: 'Bob Jones', email: 'b@x.com' }),
    }
    const out = redactEmployeeMap(map)
    expect(Object.keys(out).sort()).toEqual(['a', 'b'])
    expect(out.a.name).toBe('A.S.')
    expect(out.b.name).toBe('B.J.')
    expect(out.b.email).toBe('')
  })
})
