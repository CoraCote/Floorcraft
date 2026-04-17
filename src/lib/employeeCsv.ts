import Papa from 'papaparse'
import type { Employee } from '../types/employee'

/**
 * Round-trip-safe CSV export: column shape matches what `parseEmployeeCSV`
 * in `lib/csv.ts` consumes, so a user can Export CSV, edit in a spreadsheet,
 * and re-Import without mapping columns manually.
 *
 * Manager is exported as a *name* (not id) so the output is portable across
 * re-imports where ids will change. On import, names are resolved against
 * the full employee set (see `CSVImportDialog`'s two-pass resolver).
 */
export function employeesToCSV(
  employees: Employee[],
  allEmployees: Record<string, Employee>,
): string {
  const rows = employees.map((e) => ({
    name: e.name,
    email: e.email,
    department: e.department ?? '',
    team: e.team ?? '',
    title: e.title ?? '',
    manager: e.managerId ? (allEmployees[e.managerId]?.name ?? '') : '',
    type: e.employmentType,
    status: e.status,
    office_days: e.officeDays.join(', '),
    start_date: e.startDate ?? '',
    tags: e.tags.join(', '),
  }))
  return Papa.unparse(rows, { header: true })
}

/**
 * Trigger a browser download of the provided CSV text. Extracted so callers
 * can test the CSV generation independently of the download side-effect.
 */
export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
