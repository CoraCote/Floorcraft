import { describe, it, expect } from 'vitest'
import { skippedRowsToCSV, parseEmployeeCSV } from '../lib/employeeCsv'
import type { ImportIssue } from '../lib/employeeCsv'

describe('skippedRowsToCSV', () => {
  it('round-trips: downloaded skipped CSV re-parses to the same rows', () => {
    const issues: ImportIssue[] = [
      {
        rowIndex: 3,
        reason: 'blank_name',
        message: 'Missing name',
        raw: {
          name: '',
          email: 'ghost@co.com',
          department: 'Ops',
          team: undefined,
          title: undefined,
          manager: undefined,
          type: 'full-time',
          status: undefined,
          office_days: undefined,
          start_date: undefined,
          end_date: undefined,
          equipment_needs: undefined,
          equipment_status: undefined,
          photo_url: undefined,
          tags: undefined,
        },
      },
      {
        rowIndex: 7,
        reason: 'duplicate_email',
        message: 'Email already exists',
        raw: {
          name: 'Bob',
          email: 'bob@co.com',
          department: 'Eng',
          team: undefined,
          title: undefined,
          manager: undefined,
          type: 'full-time',
          status: undefined,
          office_days: undefined,
          start_date: undefined,
          end_date: undefined,
          equipment_needs: undefined,
          equipment_status: undefined,
          photo_url: undefined,
          tags: undefined,
        },
      },
    ]

    const csv = skippedRowsToCSV(issues)
    const parsed = parseEmployeeCSV(csv)
    expect(parsed.errors).toEqual([])
    // 2 skipped rows in, 2 rows out.
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].email).toBe('ghost@co.com')
    expect(parsed.rows[1].name).toBe('Bob')
  })

  it('includes a trailing skip_reason column so users can see why each row was rejected', () => {
    const issues: ImportIssue[] = [
      {
        rowIndex: 1,
        reason: 'blank_name',
        message: 'Missing name',
        raw: {
          name: '',
          email: 'a@co.com',
          department: undefined,
          team: undefined,
          title: undefined,
          manager: undefined,
          type: 'full-time',
          status: undefined,
          office_days: undefined,
          start_date: undefined,
          end_date: undefined,
          equipment_needs: undefined,
          equipment_status: undefined,
          photo_url: undefined,
          tags: undefined,
        },
      },
    ]
    const csv = skippedRowsToCSV(issues)
    expect(csv.split('\n')[0]).toContain('skip_reason')
    expect(csv).toContain('blank_name')
  })

  it('returns empty-but-valid CSV (header only) when given no issues', () => {
    const csv = skippedRowsToCSV([])
    const firstLine = csv.split('\n')[0]
    expect(firstLine).toContain('name')
    expect(firstLine).toContain('skip_reason')
  })
})
