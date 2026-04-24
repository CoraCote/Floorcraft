import { describe, it, expect } from 'vitest'
import { commitDueStatusChanges } from '../lib/commitDueStatusChanges'
import type { Employee, PendingStatusChange } from '../types/employee'

/**
 * The commit routine is the heart of effective-dated status changes —
 * it's what ProjectShell's load path and the midnight tick both call.
 * We cover it as a pure function so the React integration layer can
 * stay thin and trust it.
 */

function baseEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'e1',
    name: 'Alice',
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
    seatId: null,
    floorId: null,
    pendingStatusChanges: [],
    accommodations: [],
    createdAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function change(overrides: Partial<PendingStatusChange>): PendingStatusChange {
  return {
    id: 'c1',
    status: 'on-leave',
    effectiveDate: '2025-06-01',
    note: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('commitDueStatusChanges', () => {
  it('applies a past-dated change (status updates, pending removed)', () => {
    const e = baseEmployee({
      pendingStatusChanges: [change({ effectiveDate: '2025-05-01', status: 'on-leave' })],
    })
    const { nextEmployees, transitions, employeesChanged } = commitDueStatusChanges(
      { e1: e },
      '2025-06-15',
    )
    expect(nextEmployees.e1.status).toBe('on-leave')
    expect(nextEmployees.e1.pendingStatusChanges).toHaveLength(0)
    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({
      employeeId: 'e1',
      from: 'active',
      to: 'on-leave',
      effectiveDate: '2025-05-01',
    })
    expect(employeesChanged).toBe(1)
  })

  it('leaves a future-dated change untouched', () => {
    const entry = change({ effectiveDate: '2025-12-31', status: 'sabbatical' })
    const e = baseEmployee({ pendingStatusChanges: [entry] })
    const { nextEmployees, transitions, employeesChanged } = commitDueStatusChanges(
      { e1: e },
      '2025-06-15',
    )
    expect(nextEmployees.e1.status).toBe('active')
    expect(nextEmployees.e1.pendingStatusChanges).toEqual([entry])
    expect(transitions).toHaveLength(0)
    expect(employeesChanged).toBe(0)
    // Same object identity preserved on the no-op path (cheap compare).
    expect(nextEmployees.e1).toBe(e)
  })

  it('resolves multiple changes in date order', () => {
    const e = baseEmployee({
      pendingStatusChanges: [
        change({ id: 'c1', effectiveDate: '2025-05-01', status: 'on-leave' }),
        change({ id: 'c2', effectiveDate: '2025-06-01', status: 'active' }),
        change({ id: 'c3', effectiveDate: '2025-08-01', status: 'sabbatical' }),
      ],
    })
    const { nextEmployees, transitions } = commitDueStatusChanges(
      { e1: e },
      '2025-06-15',
    )
    // c1 and c2 are due — land on `active` (c2's status). c3 still queued.
    expect(nextEmployees.e1.status).toBe('active')
    expect(nextEmployees.e1.pendingStatusChanges).toHaveLength(1)
    expect(nextEmployees.e1.pendingStatusChanges[0].id).toBe('c3')
    expect(transitions.map((t) => t.to)).toEqual(['on-leave', 'active'])
  })

  it('applies a change whose effectiveDate equals today (same-day cutoff)', () => {
    const e = baseEmployee({
      pendingStatusChanges: [change({ effectiveDate: '2025-06-15', status: 'on-leave' })],
    })
    const { nextEmployees, transitions } = commitDueStatusChanges(
      { e1: e },
      '2025-06-15',
    )
    expect(nextEmployees.e1.status).toBe('on-leave')
    expect(transitions).toHaveLength(1)
  })

  it('drops a duplicate-status change from pending without recording a transition', () => {
    const e = baseEmployee({
      status: 'active',
      pendingStatusChanges: [change({ effectiveDate: '2025-05-01', status: 'active' })],
    })
    const { nextEmployees, transitions, employeesChanged } = commitDueStatusChanges(
      { e1: e },
      '2025-06-15',
    )
    expect(nextEmployees.e1.status).toBe('active')
    expect(nextEmployees.e1.pendingStatusChanges).toHaveLength(0)
    expect(transitions).toHaveLength(0)
    // Still counts as "changed" because the pending queue was trimmed,
    // but `transitions` is the user-visible audit trail and stays empty.
    expect(employeesChanged).toBe(1)
  })

  it('is pure — same inputs yield structurally equal outputs', () => {
    const employees = {
      e1: baseEmployee({
        pendingStatusChanges: [
          change({ id: 'c1', effectiveDate: '2025-05-01', status: 'on-leave' }),
          change({ id: 'c2', effectiveDate: '2025-08-01', status: 'active' }),
        ],
      }),
      e2: baseEmployee({ id: 'e2', name: 'Bob', status: 'on-leave' }),
    }
    const a = commitDueStatusChanges(employees, '2025-06-15')
    const b = commitDueStatusChanges(employees, '2025-06-15')
    expect(JSON.stringify(a.nextEmployees)).toBe(JSON.stringify(b.nextEmployees))
    expect(a.transitions).toEqual(b.transitions)
    // And the input is not mutated.
    expect(employees.e1.pendingStatusChanges).toHaveLength(2)
    expect(employees.e1.status).toBe('active')
  })

  it('tolerates unsorted input arrays', () => {
    const e = baseEmployee({
      pendingStatusChanges: [
        change({ id: 'c2', effectiveDate: '2025-06-01', status: 'active' }),
        change({ id: 'c1', effectiveDate: '2025-05-01', status: 'on-leave' }),
      ],
    })
    const { transitions } = commitDueStatusChanges({ e1: e }, '2025-06-15')
    // Still resolved in date order: on-leave first, then back to active.
    expect(transitions.map((t) => t.to)).toEqual(['on-leave', 'active'])
  })

  it('keeps employees with an empty queue untouched (identity-stable)', () => {
    const e = baseEmployee()
    const out = commitDueStatusChanges({ e1: e }, '2025-06-15')
    expect(out.nextEmployees.e1).toBe(e)
    expect(out.employeesChanged).toBe(0)
    expect(out.transitions).toHaveLength(0)
  })
})
