import Papa from 'papaparse'
import {
  isEmployeeStatus,
  type Employee,
  type EmployeeImportRow,
  type EmployeeStatus,
} from '../types/employee'

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

/**
 * Hard caps for CSV ingestion. PapaParse will happily chew through a
 * multi-GB file synchronously on the main thread and wedge the tab — and
 * we round-trip imports into a single JSONB payload that Postgres has a
 * documented 1 GB hard ceiling on.
 *
 *   - MAX_BYTES (5 MB)  → rejects oversized uploads before we allocate.
 *   - MAX_ROWS (10 000) → refuses absurd directories that would blow up
 *                         the office payload and DoS the UI.
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

export interface EmployeeCSVParseResult {
  headers: string[]
  rows: EmployeeImportRow[]
  errors: string[]
}

/**
 * Parse an HR CSV into `EmployeeImportRow`s. Throws `CSVTooLargeError`
 * for module-level failures (oversized file, too many rows). Per-row
 * data validation is NOT done here — that lives in `validateImportRows`.
 * Result rows are filtered to drop entirely blank ones (PapaParse can
 * emit trailing-newline empty rows); we preserve the original row index
 * on the returned rows so downstream validation can cite it.
 */
export function parseEmployeeCSV(text: string): EmployeeCSVParseResult {
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

  return { headers, rows, errors }
}

/**
 * Generic CSV serializer for the Export dialog's employee roster view,
 * which includes seat/floor columns that aren't part of the round-trip
 * schema. Kept separate from `employeesToCSV` because its column shape
 * differs and it isn't designed for re-import.
 */
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
  }>,
): string {
  return Papa.unparse(employees)
}

export type ImportReason =
  | 'blank_name'
  | 'manager_unresolved'
  | 'duplicate_email'
  | 'invalid_status'
  | 'invalid_start_date'

export interface ImportIssue {
  /** 1-based index into the parsed row list (post-header). */
  rowIndex: number
  reason: ImportReason
  /** Original row as it appeared in the import, for the skipped-CSV download. */
  raw: EmployeeImportRow
  /** Human-readable message for the summary list. */
  message: string
}

/**
 * A row that passed validation, ready to be fed into the employee store.
 * `managerName` is kept as a string because manager resolution against
 * the full employee set (including same-import peers) happens in the
 * importer, not the validator — it needs the post-add id list.
 */
export interface ValidImportRow {
  name: string
  email: string
  department: string | null
  team: string | null
  title: string | null
  managerName: string | null
  employmentType: 'full-time' | 'contractor' | 'part-time' | 'intern'
  status: EmployeeStatus
  officeDays: string[]
  startDate: string | null
  endDate: string | null
  equipmentNeeds: string[]
  equipmentStatus: 'pending' | 'provisioned' | 'not-needed'
  photoUrl: string | null
  tags: string[]
}

export interface ValidationResult {
  valid: ValidImportRow[]
  skipped: ImportIssue[]
  warnings: ImportIssue[]
}

/**
 * Per-row validation that produces a ValidImportRow or an ImportIssue per
 * problem found. Structural problems (blank name, duplicate email) skip
 * the row entirely; soft problems (invalid status, bad date, unresolved
 * manager) become warnings with safe fallbacks so the rest of the row
 * still imports.
 *
 * Manager resolution only happens against `existing` here — same-import
 * peer resolution is the caller's job because it needs the ids assigned
 * on add.
 */
export function validateImportRows(
  rows: EmployeeImportRow[],
  existing: Record<string, { id: string; name: string; email: string | null }>,
): ValidationResult {
  const valid: ValidImportRow[] = []
  const skipped: ImportIssue[] = []
  const warnings: ImportIssue[] = []

  // Pre-build a set of existing emails for O(1) lookup, plus a set of
  // emails seen in this import so we can detect intra-import duplicates.
  const existingEmails = new Set<string>()
  for (const e of Object.values(existing)) {
    if (e.email) existingEmails.add(e.email.trim().toLowerCase())
  }
  const seenEmails = new Set<string>()

  // Build a manager-name index for soft resolution (case-insensitive).
  // Same-import peers aren't in here — that's the caller's responsibility.
  const managerNameIndex = new Set<string>()
  for (const e of Object.values(existing)) {
    managerNameIndex.add(e.name.trim().toLowerCase())
  }
  for (const r of rows) {
    const n = r.name?.trim().toLowerCase()
    if (n) managerNameIndex.add(n)
  }

  rows.forEach((r, idx) => {
    const rowIndex = idx + 1

    // 1. Blank name → structural skip (can't create a nameless employee).
    const name = r.name?.trim() ?? ''
    if (name === '') {
      skipped.push({
        rowIndex,
        reason: 'blank_name',
        raw: r,
        message: 'Missing name',
      })
      return
    }

    // 2. Duplicate email → structural skip. We skip the LATER occurrence
    //    (first-wins) because the user likely meant "update Bob's record"
    //    but can't express that in the CSV format.
    const email = r.email?.trim() ?? ''
    const emailLower = email.toLowerCase()
    if (emailLower) {
      if (existingEmails.has(emailLower) || seenEmails.has(emailLower)) {
        skipped.push({
          rowIndex,
          reason: 'duplicate_email',
          raw: r,
          message: `Email "${email}" already exists`,
        })
        return
      }
      seenEmails.add(emailLower)
    }

    // 3. Status → warn + fallback to 'active'.
    let status: EmployeeStatus = 'active'
    if (r.status !== undefined && r.status.trim() !== '') {
      const lower = r.status.trim().toLowerCase()
      if (isEmployeeStatus(lower)) {
        status = lower
      } else {
        warnings.push({
          rowIndex,
          reason: 'invalid_status',
          raw: r,
          message: `Unknown status "${r.status}" — defaulting to active`,
        })
      }
    }

    // 4. start_date → warn + null if unparseable. Accept ISO (YYYY-MM-DD)
    //    and US (M/D/YYYY). Everything else warns. We normalise to ISO so
    //    the rest of the app has one date format.
    let startDate: string | null = null
    if (r.start_date !== undefined && r.start_date.trim() !== '') {
      const normalised = normaliseDate(r.start_date)
      if (normalised) {
        startDate = normalised
      } else {
        warnings.push({
          rowIndex,
          reason: 'invalid_start_date',
          raw: r,
          message: `Unparseable start date "${r.start_date}"`,
        })
      }
    }

    // 5. Manager: soft lookup. Accept if present in existing or in this
    //    import (case-insensitive match). Otherwise warn and keep the
    //    name for the caller (in case the caller has extra resolution).
    let managerName: string | null = null
    if (r.manager !== undefined && r.manager.trim() !== '') {
      managerName = r.manager.trim()
      if (!managerNameIndex.has(managerName.toLowerCase())) {
        warnings.push({
          rowIndex,
          reason: 'manager_unresolved',
          raw: r,
          message: `Manager "${managerName}" not found`,
        })
      }
    }

    // 6. end_date: same rules as start_date but NOT in the reason-code
    //    set, so we silently null it when unparseable. Rationale: end_date
    //    is almost always blank; the reason-code schema is already full
    //    and adding a code per optional field leads to alert fatigue.
    let endDate: string | null = null
    if (r.end_date !== undefined && r.end_date.trim() !== '') {
      endDate = normaliseDate(r.end_date) ?? null
    }

    // 7. Lists: split on comma, trim, drop empties.
    const officeDays = splitList(r.office_days)
    const tags = splitList(r.tags)
    const equipmentNeeds = splitList(r.equipment_needs)

    valid.push({
      name,
      email,
      department: r.department?.trim() || null,
      team: r.team?.trim() || null,
      title: r.title?.trim() || null,
      managerName,
      employmentType: normaliseEmploymentType(r.type),
      status,
      officeDays,
      startDate,
      endDate,
      equipmentNeeds,
      equipmentStatus: normaliseEquipmentStatus(r.equipment_status),
      photoUrl: r.photo_url?.trim() || null,
      tags,
    })
  })

  return { valid, skipped, warnings }
}

function splitList(v: string | undefined): string[] {
  if (!v) return []
  return v.split(',').map((t) => t.trim()).filter(Boolean)
}

function normaliseEmploymentType(
  v: string | undefined,
): 'full-time' | 'contractor' | 'part-time' | 'intern' {
  const lower = v?.trim().toLowerCase()
  if (lower === 'contractor' || lower === 'part-time' || lower === 'intern') {
    return lower
  }
  return 'full-time'
}

function normaliseEquipmentStatus(
  v: string | undefined,
): 'pending' | 'provisioned' | 'not-needed' {
  const lower = v?.trim().toLowerCase()
  if (lower === 'pending' || lower === 'provisioned' || lower === 'not-needed') {
    return lower
  }
  return 'not-needed'
}

/**
 * Accept ISO (YYYY-MM-DD) or US (M/D/YYYY or MM/DD/YYYY). Return null on
 * anything else — no heuristics, no string-of-month parsing. Spreadsheet
 * exports use one of these two formats 99% of the time; everything else
 * is user error and deserves a warning, not a guess.
 */
function normaliseDate(s: string): string | null {
  const trimmed = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T00:00:00Z')
    if (!Number.isNaN(d.getTime())) return trimmed
    return null
  }
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (usMatch) {
    const [, m, d, y] = usMatch
    const mm = m.padStart(2, '0')
    const dd = d.padStart(2, '0')
    const iso = `${y}-${mm}-${dd}`
    const parsed = new Date(iso + 'T00:00:00Z')
    if (!Number.isNaN(parsed.getTime())) return iso
  }
  return null
}

/**
 * Shape of the store's `addEmployee` we depend on. Keeping it narrow so
 * this module stays free of store types; the dialog passes the real
 * function in.
 */
export interface ImportDeps {
  valid: ValidImportRow[]
  existing: Record<string, { id: string; name: string; email: string | null }>
  addEmployee: (data: {
    name: string
    email: string
    department: string | null
    team: string | null
    title: string | null
    managerId: string | null
    employmentType: ValidImportRow['employmentType']
    status: ValidImportRow['status']
    officeDays: string[]
    startDate: string | null
    endDate: string | null
    equipmentNeeds: string[]
    equipmentStatus: ValidImportRow['equipmentStatus']
    photoUrl: string | null
    tags: string[]
    seatId: null
    floorId: null
  }) => string
  updateEmployee: (id: string, updates: { managerId?: string | null }) => void
}

export interface ImportOutcome {
  imported: Array<{ id: string; name: string; email: string }>
}

/**
 * Two-pass add:
 *
 * Pass 1 — create each employee with managerId: null, remembering any
 *          manager name the row referenced.
 * Pass 2 — resolve manager names against the union of existing employees
 *          and same-import peers (case-insensitive). A match updates
 *          managerId; a miss leaves it null (the validator already
 *          warned).
 *
 * Kept separate from validation because the caller wires the store
 * mutations, which is where the "new ids assigned on add" information
 * only becomes available.
 */
export function importEmployees(deps: ImportDeps): ImportOutcome {
  const { valid, existing, addEmployee, updateEmployee } = deps
  const imported: ImportOutcome['imported'] = []
  const pending: Array<{ newId: string; managerName: string }> = []

  for (const row of valid) {
    const newId = addEmployee({
      name: row.name,
      email: row.email,
      department: row.department,
      team: row.team,
      title: row.title,
      managerId: null,
      employmentType: row.employmentType,
      status: row.status,
      officeDays: row.officeDays,
      startDate: row.startDate,
      endDate: row.endDate,
      equipmentNeeds: row.equipmentNeeds,
      equipmentStatus: row.equipmentStatus,
      photoUrl: row.photoUrl,
      tags: row.tags,
      seatId: null,
      floorId: null,
    })
    imported.push({ id: newId, name: row.name, email: row.email })
    if (row.managerName) {
      pending.push({ newId, managerName: row.managerName })
    }
  }

  // Build a name→id index from existing + just-added.
  const byName = new Map<string, string>()
  for (const e of Object.values(existing)) {
    byName.set(e.name.trim().toLowerCase(), e.id)
  }
  for (const row of imported) {
    byName.set(row.name.trim().toLowerCase(), row.id)
  }

  for (const { newId, managerName } of pending) {
    const match = byName.get(managerName.trim().toLowerCase())
    if (match && match !== newId) {
      updateEmployee(newId, { managerId: match })
    }
  }

  return { imported }
}

/**
 * Column order must match `employeesToCSV` so users can copy the skipped
 * rows straight back into their source sheet. We append `skip_reason` as
 * the last column — `parseEmployeeCSV` ignores unknown columns, so a
 * re-import just drops it.
 */
const SKIPPED_CSV_COLUMNS = [
  'name',
  'email',
  'department',
  'team',
  'title',
  'manager',
  'type',
  'status',
  'office_days',
  'start_date',
  'end_date',
  'equipment_needs',
  'equipment_status',
  'photo_url',
  'tags',
  'skip_reason',
] as const

export function skippedRowsToCSV(issues: ImportIssue[]): string {
  const rows = issues.map((issue) => {
    const r = issue.raw
    return {
      name: r.name ?? '',
      email: r.email ?? '',
      department: r.department ?? '',
      team: r.team ?? '',
      title: r.title ?? '',
      manager: r.manager ?? '',
      type: r.type ?? '',
      status: r.status ?? '',
      office_days: r.office_days ?? '',
      start_date: r.start_date ?? '',
      end_date: r.end_date ?? '',
      equipment_needs: r.equipment_needs ?? '',
      equipment_status: r.equipment_status ?? '',
      photo_url: r.photo_url ?? '',
      tags: r.tags ?? '',
      skip_reason: issue.reason,
    }
  })
  // Papa.unparse returns '' for an empty `rows` array even when `columns`
  // is set, so we emit the header ourselves for that case. A header-only
  // CSV is still useful as a template.
  if (rows.length === 0) {
    return SKIPPED_CSV_COLUMNS.join(',')
  }
  return Papa.unparse(rows, { header: true, columns: [...SKIPPED_CSV_COLUMNS] })
}
