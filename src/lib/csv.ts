import Papa from 'papaparse'
import type { EmployeeImportRow } from '../types/employee'

export interface EmployeeCSVParseResult {
  headers: string[]
  rows: EmployeeImportRow[]
  errors: string[]
}

/**
 * Hard caps for CSV ingestion. These exist because PapaParse will happily
 * chew through a multi-GB file synchronously on the main thread and wedge
 * the tab — and because we round-trip imports into a single JSONB payload
 * that Postgres has a documented 1 GB hard ceiling on.
 *
 *   - MAX_BYTES (5 MB)  → rejects oversized uploads before we allocate.
 *   - MAX_ROWS (10 000) → refuses absurd directories that would blow up
 *                         the office payload and also DoS the UI.
 *
 * The thresholds are deliberately loose (Aircall itself is ~2 000
 * headcount, so 10 k is 5× the largest realistic tenant). Teams that
 * actually exceed these limits should be split into multiple floors /
 * offices anyway.
 */
export const CSV_MAX_BYTES = 5 * 1024 * 1024
export const CSV_MAX_ROWS = 10_000

export class CSVTooLargeError extends Error {
  readonly kind: 'bytes' | 'rows'
  constructor(kind: 'bytes' | 'rows', message: string) {
    super(message)
    this.name = 'CSVTooLargeError'
    this.kind = kind
  }
}

export function parseEmployeeCSV(text: string): EmployeeCSVParseResult {
  // `text.length` is char count; for ASCII-dominant CSVs it tracks bytes
  // closely enough, and `Blob.size`-level accuracy isn't required here —
  // this is a cheap guard, not an upload quota.
  const byteLen = new Blob([text]).size
  if (byteLen > CSV_MAX_BYTES) {
    throw new CSVTooLargeError(
      'bytes',
      `CSV is ${(byteLen / 1024 / 1024).toFixed(1)} MB; the maximum is ${CSV_MAX_BYTES / 1024 / 1024} MB.`,
    )
  }

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  if (result.data.length > CSV_MAX_ROWS) {
    throw new CSVTooLargeError(
      'rows',
      `CSV has ${result.data.length.toLocaleString()} rows; the maximum is ${CSV_MAX_ROWS.toLocaleString()}. Split the file and import in batches.`,
    )
  }

  const headers = result.meta.fields || []
  const errors = result.errors.map((e) => `Row ${e.row}: ${e.message}`)

  const rows: EmployeeImportRow[] = result.data.map((row) => {
    // Flexible column name mapping — accept a few common aliases for each
    // field so the parser can round-trip `employeesToCSV` output AND be
    // forgiving of hand-written spreadsheets.
    const name = row.name || row.full_name || row.employee_name || ''
    const email = row.email || row.email_address || undefined
    const department = row.department || row.dept || undefined
    const team = row.team || row.group || undefined
    const title = row.title || row.role || row.job_title || undefined
    const manager = row.manager || row.manager_name || row.reports_to || undefined
    const type = row.type || row.employment_type || 'full-time'
    const status = row.status || row.employee_status || undefined
    const office_days = row.office_days || row.days || row.in_office || undefined
    const start_date = row.start_date || row.hire_date || undefined
    const end_date = row.end_date || row.termination_date || undefined
    const equipment_needs = row.equipment_needs || row.equipment || undefined
    const equipment_status = row.equipment_status || undefined
    const photo_url = row.photo_url || row.photo || row.avatar || undefined
    const tags = row.tags || undefined

    return {
      name,
      email,
      department,
      team,
      title,
      manager,
      type,
      status,
      office_days,
      start_date,
      end_date,
      equipment_needs,
      equipment_status,
      photo_url,
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
