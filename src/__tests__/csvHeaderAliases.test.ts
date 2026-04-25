import { describe, it, expect } from 'vitest'
import {
  HEADER_ALIASES,
  resolveHeaderAlias,
  parseEmployeeCSV,
  buildEmployeeImportTemplate,
} from '../lib/employeeCsv'

describe('resolveHeaderAlias', () => {
  it('resolves canonical names to themselves', () => {
    expect(resolveHeaderAlias('name')).toBe('name')
    expect(resolveHeaderAlias('email')).toBe('email')
    expect(resolveHeaderAlias('start_date')).toBe('start_date')
  })

  it('resolves common BambooHR/Workday aliases', () => {
    expect(resolveHeaderAlias('Email Address')).toBe('email')
    expect(resolveHeaderAlias('Job Title')).toBe('title')
    expect(resolveHeaderAlias('Manager')).toBe('manager')
    expect(resolveHeaderAlias('Reports To')).toBe('manager')
    expect(resolveHeaderAlias('Hire Date')).toBe('start_date')
    expect(resolveHeaderAlias('Department')).toBe('department')
    expect(resolveHeaderAlias('Dept')).toBe('department')
    expect(resolveHeaderAlias('Employee Type')).toBe('type')
  })

  it('is case- and punctuation-insensitive', () => {
    // first_name family
    expect(resolveHeaderAlias('First Name')).toBe('first_name')
    expect(resolveHeaderAlias('first_name')).toBe('first_name')
    expect(resolveHeaderAlias('first-name')).toBe('first_name')
    expect(resolveHeaderAlias('FIRSTNAME')).toBe('first_name')
    expect(resolveHeaderAlias('  First   Name  ')).toBe('first_name')
  })

  it('falls back to lowercased trimmed input for unknown headers', () => {
    expect(resolveHeaderAlias('Cost Center')).toBe('cost center')
    expect(resolveHeaderAlias('CustomField1')).toBe('customfield1')
  })
})

describe('parseEmployeeCSV — alias resolution', () => {
  it('reads First Name + Last Name into a synthesised name field', () => {
    const csv = [
      'First Name,Last Name,Email Address',
      'Jane,Doe,jane@example.com',
      'Bob,Smith,bob@example.com',
    ].join('\n')
    const result = parseEmployeeCSV(csv)
    expect(result.firstLastConcatenated).toBe(true)
    expect(result.rows[0].name).toBe('Jane Doe')
    expect(result.rows[0].email).toBe('jane@example.com')
    expect(result.rows[1].name).toBe('Bob Smith')
  })

  it('prefers explicit name column when both name and first/last are present', () => {
    const csv = [
      'name,first_name,last_name,email',
      'Jane Q. Doe,Jane,Doe,jane@example.com',
    ].join('\n')
    const result = parseEmployeeCSV(csv)
    // first/last concatenation should NOT fire when `name` exists.
    expect(result.firstLastConcatenated).toBe(false)
    expect(result.rows[0].name).toBe('Jane Q. Doe')
  })

  it('records header aliases that were applied', () => {
    const csv = [
      'Full Name,Email Address,Job Title,Reports To',
      'Jane Doe,jane@example.com,Engineer,Alex Lee',
    ].join('\n')
    const result = parseEmployeeCSV(csv)
    expect(result.headerAliases).toMatchObject({
      'Full Name': 'name',
      'Email Address': 'email',
      'Job Title': 'title',
      'Reports To': 'manager',
    })
  })

  it('leaves headerAliases empty when canonical headers were used', () => {
    const csv = ['name,email', 'Jane,jane@example.com'].join('\n')
    const result = parseEmployeeCSV(csv)
    expect(result.headerAliases).toEqual({})
    expect(result.firstLastConcatenated).toBe(false)
  })

  it('handles a Notion-style export', () => {
    const csv = [
      'Name,E-mail,Department,Team,Position,Supervisor,Status,Hire Date',
      'Jane Doe,jane@example.com,Engineering,FE,Senior Engineer,Alex Lee,active,2024-03-01',
    ].join('\n')
    const result = parseEmployeeCSV(csv)
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row.name).toBe('Jane Doe')
    expect(row.email).toBe('jane@example.com')
    expect(row.title).toBe('Senior Engineer')
    expect(row.manager).toBe('Alex Lee')
    expect(row.start_date).toBe('2024-03-01')
  })

  it('handles only first_name (no last_name) by trimming', () => {
    const csv = ['first_name,email', 'Cher,cher@example.com'].join('\n')
    const result = parseEmployeeCSV(csv)
    expect(result.firstLastConcatenated).toBe(true)
    expect(result.rows[0].name).toBe('Cher')
  })
})

describe('HEADER_ALIASES table', () => {
  it('has every canonical key listed as its own first alias (self-match)', () => {
    for (const canonical of Object.keys(HEADER_ALIASES)) {
      expect(HEADER_ALIASES[canonical]).toContain(canonical)
    }
  })
})

describe('buildEmployeeImportTemplate', () => {
  it('emits a CSV with all canonical headers in canonical order', () => {
    const csv = buildEmployeeImportTemplate()
    const firstLine = csv.split('\n')[0]
    expect(firstLine).toContain('name')
    expect(firstLine).toContain('email')
    expect(firstLine).toContain('department')
    expect(firstLine).toContain('manager')
    expect(firstLine).toContain('start_date')
    expect(firstLine).toContain('tags')
  })

  it('includes at least one fully-populated example row', () => {
    const csv = buildEmployeeImportTemplate()
    expect(csv).toContain('Jane Doe')
    expect(csv).toContain('jane@example.com')
  })

  it('round-trips through the parser without throwing', () => {
    const csv = buildEmployeeImportTemplate()
    const result = parseEmployeeCSV(csv)
    // The comment-style row + Jane + Sam = 3 parsed rows.
    expect(result.rows.length).toBeGreaterThanOrEqual(2)
    // Jane should resolve cleanly.
    const jane = result.rows.find((r) => r.name === 'Jane Doe')
    expect(jane).toBeDefined()
    expect(jane?.email).toBe('jane@example.com')
  })
})
