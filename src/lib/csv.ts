import Papa from 'papaparse'
import type { EmployeeImportRow } from '../types/employee'

export interface EmployeeCSVParseResult {
  headers: string[]
  rows: EmployeeImportRow[]
  errors: string[]
}

export function parseEmployeeCSV(text: string): EmployeeCSVParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const headers = result.meta.fields || []
  const errors = result.errors.map((e) => `Row ${e.row}: ${e.message}`)

  const rows: EmployeeImportRow[] = result.data.map((row) => {
    // Flexible column name mapping
    const name = row.name || row.full_name || row.employee_name || ''
    const email = row.email || row.email_address || undefined
    const department = row.department || row.dept || undefined
    const team = row.team || row.group || undefined
    const title = row.title || row.role || row.job_title || undefined
    const manager = row.manager || row.manager_name || row.reports_to || undefined
    const type = row.type || row.employment_type || 'full-time'
    const office_days = row.office_days || row.days || row.in_office || undefined
    const start_date = row.start_date || row.hire_date || undefined
    const tags = row.tags || undefined

    return {
      name,
      email,
      department,
      team,
      title,
      manager,
      type,
      office_days,
      start_date,
      tags,
    }
  })

  return { headers, rows: rows.filter((r) => r.name.trim() !== ''), errors }
}

export function exportEmployeeCSV(
  employees: Array<{
    name: string
    email: string
    department: string
    team: string
    title: string
    floor: string
    desk: string
    manager: string
    type: string
    office_days: string
    tags: string
  }>
): string {
  return Papa.unparse(employees)
}
