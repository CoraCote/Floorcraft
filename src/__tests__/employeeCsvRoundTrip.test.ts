import { describe, it, expect } from 'vitest'
import { employeesToCSV } from '../lib/employeeCsv'
import { parseEmployeeCSV } from '../lib/employeeCsv'
import type { Employee } from '../types/employee'

/**
 * End-to-end round-trip: every field the drawer edits survives an
 * employeesToCSV → parseEmployeeCSV cycle. Regression guard for the
 * "CSV export/import drops fields" class of bugs — the importer used to
 * silently ignore end_date, equipment_needs, equipment_status, photo_url
 * and status, so a user who exported and reimported would lose data.
 */
function makeEmployee(over: Partial<Employee> = {}): Employee {
  return {
    id: over.id ?? 'e1',
    name: over.name ?? 'Alice',
    email: over.email ?? 'alice@example.com',
    department: over.department ?? 'Engineering',
    team: over.team ?? 'Platform',
    title: over.title ?? 'Senior Engineer',
    managerId: over.managerId ?? null,
    employmentType: over.employmentType ?? 'full-time',
    status: over.status ?? 'active',
    officeDays: over.officeDays ?? ['Mon', 'Wed'],
    startDate: over.startDate ?? '2024-01-15',
    endDate: over.endDate ?? null,
    equipmentNeeds: over.equipmentNeeds ?? [],
    equipmentStatus: over.equipmentStatus ?? 'not-needed',
    photoUrl: over.photoUrl ?? null,
    tags: over.tags ?? [],
    accommodations: over.accommodations ?? [],
    seatId: over.seatId ?? null,
    floorId: over.floorId ?? null,
    leaveType: over.leaveType ?? null,
    expectedReturnDate: over.expectedReturnDate ?? null,
    coverageEmployeeId: over.coverageEmployeeId ?? null,
    leaveNotes: over.leaveNotes ?? null,
    departureDate: over.departureDate ?? null,
    createdAt: over.createdAt ?? '2024-01-01T00:00:00.000Z',
  }
}

describe('Employee CSV round-trip', () => {
  it('preserves every drawer-editable field across export+parse', () => {
    const alice = makeEmployee({
      id: 'e1',
      name: 'Alice',
      email: 'alice@example.com',
      startDate: '2024-01-15',
      endDate: '2025-06-30',
      equipmentNeeds: ['laptop', 'monitor'],
      equipmentStatus: 'provisioned',
      photoUrl: 'https://cdn.example.com/alice.png',
      status: 'on-leave',
      tags: ['remote', 'priority'],
      officeDays: ['Tue', 'Thu'],
    })
    const byId: Record<string, Employee> = { e1: alice }
    const csv = employeesToCSV([alice], byId)

    const parsed = parseEmployeeCSV(csv)
    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toHaveLength(1)
    const row = parsed.rows[0]

    expect(row.name).toBe('Alice')
    expect(row.email).toBe('alice@example.com')
    expect(row.start_date).toBe('2024-01-15')
    expect(row.end_date).toBe('2025-06-30')
    expect(row.equipment_needs).toBe('laptop, monitor')
    expect(row.equipment_status).toBe('provisioned')
    expect(row.photo_url).toBe('https://cdn.example.com/alice.png')
    expect(row.status).toBe('on-leave')
    expect(row.tags).toBe('remote, priority')
    expect(row.office_days).toBe('Tue, Thu')
  })

  it('exports manager as a name (not id) so re-imports stay portable', () => {
    const carol = makeEmployee({ id: 'e-carol', name: 'Carol' })
    const bob = makeEmployee({
      id: 'e-bob',
      name: 'Bob',
      managerId: 'e-carol',
    })
    const byId = { [carol.id]: carol, [bob.id]: bob }
    const csv = employeesToCSV([bob], byId)

    const parsed = parseEmployeeCSV(csv)
    expect(parsed.rows[0].manager).toBe('Carol')
  })

  it('accepts common spreadsheet header aliases on import', () => {
    // User hand-writes a CSV with "Full Name" instead of "name", etc.
    // The aliasing lives in parseEmployeeCSV's column mapping.
    const csv = [
      'full_name,email_address,dept,role,employee_status,hire_date,termination_date,equipment,avatar',
      'Dana,dana@co.com,Design,Lead,active,2024-03-01,,"chair,stand",https://x/d.png',
    ].join('\n')
    const parsed = parseEmployeeCSV(csv)
    expect(parsed.errors).toEqual([])
    const row = parsed.rows[0]
    expect(row.name).toBe('Dana')
    expect(row.email).toBe('dana@co.com')
    expect(row.department).toBe('Design')
    expect(row.title).toBe('Lead')
    expect(row.status).toBe('active')
    expect(row.start_date).toBe('2024-03-01')
    expect(row.equipment_needs).toBe('chair,stand')
    expect(row.photo_url).toBe('https://x/d.png')
  })
})
