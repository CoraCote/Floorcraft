import { describe, it, expect } from 'vitest'
import { parseEmployeeCSV, validateImportRows } from '../lib/employeeCsv'

describe('CSV import — 200-row file with seeded errors', () => {
  it('produces correct skipped + warning counts', () => {
    const lines = ['name,email,status,start_date,manager']
    for (let i = 1; i <= 200; i++) {
      // Seed errors:
      //   rows 10, 20, 30 → blank name
      //   rows 40, 50     → invalid status
      //   rows 60, 70     → bad date
      //   rows 80, 90     → unresolved manager
      //   row 100         → duplicate email of row 1
      let name = `Person${i}`
      let email = `p${i}@co.com`
      let status = 'active'
      let startDate = '2024-01-01'
      let manager = ''
      if (i === 10 || i === 20 || i === 30) name = ''
      if (i === 40 || i === 50) status = 'Actve'
      if (i === 60 || i === 70) startDate = 'tomorrow'
      if (i === 80 || i === 90) manager = 'Ghost'
      if (i === 100) email = 'p1@co.com'
      lines.push([name, email, status, startDate, manager].join(','))
    }
    const csv = lines.join('\n')

    const parsed = parseEmployeeCSV(csv)
    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toHaveLength(200)

    const { valid, skipped, warnings } = validateImportRows(parsed.rows, {})

    // 200 total; 4 structural skips (3 blank_name, 1 duplicate_email).
    expect(skipped).toHaveLength(4)
    expect(valid).toHaveLength(196)

    // 6 warnings: 2 status, 2 date, 2 manager.
    expect(warnings.filter((w) => w.reason === 'invalid_status')).toHaveLength(2)
    expect(warnings.filter((w) => w.reason === 'invalid_start_date')).toHaveLength(2)
    expect(warnings.filter((w) => w.reason === 'manager_unresolved')).toHaveLength(2)
  })
})
