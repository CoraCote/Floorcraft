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
    end_date: e.endDate ?? '',
    equipment_needs: e.equipmentNeeds.join(', '),
    equipment_status: e.equipmentStatus,
    photo_url: e.photoUrl ?? '',
    tags: e.tags.join(', '),
  }))
  return Papa.unparse(rows, { header: true })
}

/**
 * Trigger a browser download of the provided CSV text. Extracted so callers
 * can test the CSV generation independently of the download side-effect.
 *
 * Returns `true` on success. Returns `false` (and logs) when the browser
 * refuses — `URL.createObjectURL` can throw in sandboxed iframes or private
 * Safari; we don't want that to bubble into the autosave indicator.
 */
export function downloadCSV(filename: string, csv: string): boolean {
  let url: string | null = null
  let link: HTMLAnchorElement | null = null
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    url = URL.createObjectURL(blob)
    link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    return true
  } catch (err) {
    if (typeof console !== 'undefined') console.error('CSV download failed:', err)
    return false
  } finally {
    if (link && link.parentNode) link.parentNode.removeChild(link)
    if (url) URL.revokeObjectURL(url)
  }
}
