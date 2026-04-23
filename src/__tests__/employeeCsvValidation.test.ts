import { describe, it, expect } from 'vitest'
import { validateImportRows } from '../lib/employeeCsv'
import type { EmployeeImportRow } from '../types/employee'

function row(over: Partial<EmployeeImportRow> = {}): EmployeeImportRow {
  return { name: 'Alice', ...over }
}

describe('validateImportRows', () => {
  it('passes a minimal valid row', () => {
    const result = validateImportRows([row()], {})
    expect(result.skipped).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.valid).toHaveLength(1)
  })

  it('skips blank-name rows with reason blank_name', () => {
    const result = validateImportRows(
      [row({ name: '' }), row({ name: '   ' })],
      {},
    )
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toHaveLength(2)
    expect(result.skipped[0]).toMatchObject({
      rowIndex: 1,
      reason: 'blank_name',
    })
    expect(result.skipped[1].rowIndex).toBe(2)
  })

  it('skips a row whose email duplicates another row in the import (second occurrence)', () => {
    const result = validateImportRows(
      [
        row({ name: 'Alice', email: 'a@co.com' }),
        row({ name: 'Alicia', email: 'a@co.com' }),
      ],
      {},
    )
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].name).toBe('Alice')
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('duplicate_email')
  })

  it('skips a row whose email duplicates an existing employee', () => {
    const existing = {
      e1: {
        id: 'e1',
        name: 'Bob',
        email: 'bob@co.com',
      } as unknown as Parameters<typeof validateImportRows>[1][string],
    }
    const result = validateImportRows(
      [row({ name: 'Robbie', email: 'bob@co.com' })],
      existing,
    )
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('duplicate_email')
  })

  it('duplicate email check is case-insensitive and trims', () => {
    const result = validateImportRows(
      [
        row({ name: 'Alice', email: 'A@CO.com' }),
        row({ name: 'Alicia', email: ' a@co.com ' }),
      ],
      {},
    )
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('duplicate_email')
  })

  it('warns on invalid status and coerces to active', () => {
    const result = validateImportRows([row({ status: 'Acive' })], {})
    expect(result.valid).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].reason).toBe('invalid_status')
    expect(result.valid[0].status).toBe('active')
  })

  it('accepts valid status values case-insensitively', () => {
    const result = validateImportRows([row({ status: 'On-Leave' })], {})
    expect(result.warnings).toHaveLength(0)
    expect(result.valid[0].status).toBe('on-leave')
  })

  it('warns on invalid start_date and nulls it', () => {
    const result = validateImportRows([row({ start_date: 'tomorrow' })], {})
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].reason).toBe('invalid_start_date')
    expect(result.valid[0].startDate).toBeNull()
  })

  it('accepts ISO and US date formats for start_date', () => {
    const a = validateImportRows([row({ start_date: '2024-01-15' })], {})
    expect(a.warnings).toHaveLength(0)
    expect(a.valid[0].startDate).toBe('2024-01-15')

    const b = validateImportRows([row({ start_date: '1/15/2024' })], {})
    expect(b.warnings).toHaveLength(0)
    expect(b.valid[0].startDate).toBe('2024-01-15')
  })

  it('warns on unresolved manager and leaves managerId null', () => {
    const result = validateImportRows(
      [row({ name: 'Bob', manager: 'Nobody' })],
      {},
    )
    expect(result.valid).toHaveLength(1)
    expect(result.valid[0].managerName).toBe('Nobody')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].reason).toBe('manager_unresolved')
  })

  it('reports multiple issues on one row without double-skipping', () => {
    // Blank name AND invalid status. Blank-name wins (structural skip);
    // we don't bother reporting the status issue for a row we're dropping.
    const result = validateImportRows([row({ name: '', status: 'nope' })], {})
    expect(result.valid).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)
  })
})
