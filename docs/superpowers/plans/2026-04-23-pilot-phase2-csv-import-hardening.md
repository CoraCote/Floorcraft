# Pilot Phase 2 — CSV Import Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CSV roster import non-silent — every skipped row is reported with a reason code, every warning is visible, and HR can download a "skipped rows" CSV to fix + re-import in one loop.

**Architecture:** Consolidate serialisation + parsing into `src/lib/employeeCsv.ts` so export and import share one module and cannot drift. The parser never throws on per-row errors — bad rows become `ImportIssue` entries with a reason code. After import, `CSVImportDialog` opens a new `CSVImportSummaryModal` showing imported / skipped / warning counts, a per-row list with reason codes, and a download button for a CSV of skipped rows. Module-level errors (oversized file, too many rows) still throw — shown inline with the raw message.

**Tech Stack:** TypeScript, React 19, PapaParse (existing), Vitest + @testing-library/react, Zustand.

---

## Context for the implementer

Phase 1 shipped a viewer-role and safety papercuts (PR #25). Phase 2 is the second reliability-first pilot phase. CSV import is the dominant onboarding path — a 200-person HR spreadsheet that silently loses 18 rows because "status" was spelled "Active " with a trailing space is the #1 onboarding gotcha the current code has.

### Existing surface area

- `src/lib/csv.ts` — `parseEmployeeCSV(text)` returns `{headers, rows, errors}`. `errors` is **PapaParse syntax errors only**, not per-row data validation. Throws `CSVTooLargeError` for oversized files or too many rows. Header aliases (`full_name`/`name`, `dept`/`department`, etc.) live here. **This file will be absorbed into `employeeCsv.ts` and deleted.**
- `src/lib/employeeCsv.ts` — `employeesToCSV(employees, byId)` + `downloadCSV(filename, csv)`. Column shape is the target for round-trip parity.
- `src/components/editor/RightSidebar/CSVImportDialog.tsx` — 216-line dialog. `handleImport` does a two-pass create-then-resolve-manager flow, warns ambiguous managers via `console.warn`, then silently closes. **This file is our primary edit target.**
- `src/__tests__/employeeCsvRoundTrip.test.ts` — round-trip coverage; keep passing.
- `src/stores/employeeStore.ts` — `addEmployee(data)` returns the new id; `updateEmployee(id, updates)` is partial. Use these; don't refactor.
- `src/stores/uiStore.ts` — we'll add `csvImportSummary` state to hold the last-import result so the summary modal can render it.
- `src/types/employee.ts` — `EmployeeImportRow` is the per-row shape the importer consumes. `EmployeeStatus` enum + `isEmployeeStatus()` guard live here.

### Non-goals

- Don't change the existing column aliasing. HR-written sheets rely on it.
- Don't build a re-upload-skipped-rows flow. The user fixes in their spreadsheet and re-imports manually — the skipped CSV matches input format so this works.
- Don't touch Phase 1's viewer gating. The modal is editor-only because the Import button is already viewer-gated.

---

## Task 1: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Confirm you're on `main` and pull latest**

```bash
git checkout main
git pull
```

- [ ] **Step 2: Create and switch to the phase-2 branch**

```bash
git checkout -b feat/phase2-csv-import-hardening
```

- [ ] **Step 3: Verify baseline is green**

Run:
```bash
npx tsc --noEmit && npx vitest run && npm run build
```
Expected: all clean. Phase 1 left the repo at 325 passing tests.

---

## Task 2: Move `parseEmployeeCSV` into `employeeCsv.ts`

**Files:**
- Modify: `src/lib/employeeCsv.ts`
- Delete: `src/lib/csv.ts`
- Modify: `src/components/editor/RightSidebar/CSVImportDialog.tsx` (import path)
- Modify: `src/__tests__/employeeCsvRoundTrip.test.ts` (import path)

Why this task: the spec calls for serialise + parse to live in the same module so they can't drift. Doing the move now (before adding new API) keeps later diffs clean.

- [ ] **Step 1: Append the current parser wholesale into `employeeCsv.ts`**

Edit `src/lib/employeeCsv.ts`. Add these imports at the top alongside the existing `papaparse` import:

```typescript
import type { EmployeeImportRow } from '../types/employee'
```

Below `downloadCSV`, append:

```typescript
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
```

Note: removed the `.filter((r) => r.name.trim() !== '')` at the bottom — blank-name rows now become `blank_name` skipped rows (Task 4) rather than silently disappearing. We keep every row PapaParse emitted so row indices can be cited accurately.

- [ ] **Step 2: Update `CSVImportDialog.tsx` import**

In `src/components/editor/RightSidebar/CSVImportDialog.tsx` line 3:

Replace:
```typescript
import { parseEmployeeCSV, CSVTooLargeError } from '../../../lib/csv'
```
With:
```typescript
import { parseEmployeeCSV, CSVTooLargeError } from '../../../lib/employeeCsv'
```

- [ ] **Step 3: Update test import**

In `src/__tests__/employeeCsvRoundTrip.test.ts` line 3:

Replace:
```typescript
import { parseEmployeeCSV } from '../lib/csv'
```
With:
```typescript
import { parseEmployeeCSV } from '../lib/employeeCsv'
```

- [ ] **Step 4: Delete the old file**

```bash
rm src/lib/csv.ts
```

- [ ] **Step 5: Verify nothing else imported from `lib/csv`**

Run:
```bash
grep -rn "from '.*lib/csv'" src || echo "OK — no stale imports"
```
Expected: `OK — no stale imports`. If the grep returns matches, update each import path before continuing.

- [ ] **Step 6: Run type-check + existing tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 325 tests still pass. The blank-name filter removal will not break the round-trip test because that test builds a CSV from real employees (none blank).

But note: one behavior change. The dialog's preview table currently shows `parseEmployeeCSV` output — with the filter removed, blank-name rows will appear in preview. That's fine for now; Task 7 will surface them as skipped in the summary modal.

- [ ] **Step 7: Commit**

```bash
git add src/lib/employeeCsv.ts src/components/editor/RightSidebar/CSVImportDialog.tsx src/__tests__/employeeCsvRoundTrip.test.ts
git rm src/lib/csv.ts
git commit -m "refactor(csv): consolidate parse + serialise in employeeCsv.ts"
```

---

## Task 3: Validation types + `validateImportRows`

**Files:**
- Modify: `src/lib/employeeCsv.ts`
- Create: `src/__tests__/employeeCsvValidation.test.ts`

This task adds the reason-code schema and a pure validator. No UI wiring yet — we TDD the rule engine first.

- [ ] **Step 1: Write the failing test file**

Create `src/__tests__/employeeCsvValidation.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to see it fail**

```bash
npx vitest run src/__tests__/employeeCsvValidation.test.ts
```

Expected: FAIL — `validateImportRows` is not exported from `employeeCsv.ts`.

- [ ] **Step 3: Add the validator to `employeeCsv.ts`**

Append to `src/lib/employeeCsv.ts`:

```typescript
import { isEmployeeStatus, type EmployeeStatus } from '../types/employee'

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
```

- [ ] **Step 4: Run the test to see it pass**

```bash
npx vitest run src/__tests__/employeeCsvValidation.test.ts
```

Expected: PASS (all 10 tests).

- [ ] **Step 5: Run the full suite**

```bash
npx vitest run
```

Expected: 335 tests pass (325 existing + 10 new). No regressions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/employeeCsv.ts src/__tests__/employeeCsvValidation.test.ts
git commit -m "feat(csv): validateImportRows with reason codes"
```

---

## Task 4: Pure `importEmployees` helper

**Files:**
- Modify: `src/lib/employeeCsv.ts`
- Create: `src/__tests__/employeeCsvImport.test.ts`

Extract the two-pass import from `CSVImportDialog.handleImport` into a pure function that takes the store mutations as dependencies. This makes the full pipeline testable without React, and lets the dialog stay a thin wrapper.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/employeeCsvImport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { importEmployees } from '../lib/employeeCsv'
import type { ValidImportRow } from '../lib/employeeCsv'

function validRow(over: Partial<ValidImportRow> = {}): ValidImportRow {
  return {
    name: over.name ?? 'Alice',
    email: over.email ?? '',
    department: over.department ?? null,
    team: over.team ?? null,
    title: over.title ?? null,
    managerName: over.managerName ?? null,
    employmentType: over.employmentType ?? 'full-time',
    status: over.status ?? 'active',
    officeDays: over.officeDays ?? [],
    startDate: over.startDate ?? null,
    endDate: over.endDate ?? null,
    equipmentNeeds: over.equipmentNeeds ?? [],
    equipmentStatus: over.equipmentStatus ?? 'not-needed',
    photoUrl: over.photoUrl ?? null,
    tags: over.tags ?? [],
  }
}

describe('importEmployees', () => {
  it('adds every valid row and returns their new ids', () => {
    const calls: Array<Parameters<Parameters<typeof importEmployees>[0]['addEmployee']>[0]> = []
    const addEmployee = (data: typeof calls[number]) => {
      calls.push(data)
      return `new-${calls.length}`
    }
    const updateEmployee = () => {}

    const result = importEmployees({
      valid: [validRow({ name: 'Alice' }), validRow({ name: 'Bob' })],
      existing: {},
      addEmployee,
      updateEmployee,
    })

    expect(result.imported).toHaveLength(2)
    expect(result.imported[0]).toEqual({
      id: 'new-1',
      name: 'Alice',
      email: '',
    })
    expect(calls[0].name).toBe('Alice')
    expect(calls[0].managerId).toBeNull()
  })

  it('resolves manager names against same-import peers on a second pass', () => {
    const idByName: Record<string, string> = {}
    let i = 0
    const addEmployee = (data: { name: string }) => {
      const id = `e-${++i}`
      idByName[data.name] = id
      return id
    }
    const updates: Array<{ id: string; managerId: string | null }> = []
    const updateEmployee = (id: string, u: { managerId?: string | null }) => {
      if (u.managerId !== undefined) updates.push({ id, managerId: u.managerId })
    }

    importEmployees({
      valid: [
        validRow({ name: 'Carol' }),
        validRow({ name: 'Bob', managerName: 'Carol' }),
      ],
      existing: {},
      addEmployee: addEmployee as never,
      updateEmployee,
    })

    expect(updates).toEqual([{ id: idByName['Bob'], managerId: idByName['Carol'] }])
  })

  it('leaves managerId null when manager name does not resolve', () => {
    const addEmployee = () => 'e-1'
    const updates: Array<{ id: string; managerId: string | null }> = []
    const updateEmployee = (id: string, u: { managerId?: string | null }) => {
      if (u.managerId !== undefined) updates.push({ id, managerId: u.managerId })
    }

    importEmployees({
      valid: [validRow({ name: 'Bob', managerName: 'Ghost' })],
      existing: {},
      addEmployee: addEmployee as never,
      updateEmployee,
    })

    expect(updates).toEqual([])
  })

  it('resolves manager name against pre-existing employee', () => {
    const addEmployee = () => 'e-new'
    const updates: Array<{ id: string; managerId: string | null }> = []
    const updateEmployee = (id: string, u: { managerId?: string | null }) => {
      if (u.managerId !== undefined) updates.push({ id, managerId: u.managerId })
    }

    importEmployees({
      valid: [validRow({ name: 'Bob', managerName: 'Carol' })],
      existing: { 'e-carol': { id: 'e-carol', name: 'Carol', email: null } },
      addEmployee: addEmployee as never,
      updateEmployee,
    })

    expect(updates).toEqual([{ id: 'e-new', managerId: 'e-carol' }])
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

```bash
npx vitest run src/__tests__/employeeCsvImport.test.ts
```

Expected: FAIL — `importEmployees` is not exported.

- [ ] **Step 3: Add the helper to `employeeCsv.ts`**

Append:

```typescript
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
```

- [ ] **Step 4: Run the test to see it pass**

```bash
npx vitest run src/__tests__/employeeCsvImport.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/employeeCsv.ts src/__tests__/employeeCsvImport.test.ts
git commit -m "feat(csv): importEmployees two-pass helper"
```

---

## Task 5: Skipped-rows CSV serializer

**Files:**
- Modify: `src/lib/employeeCsv.ts`
- Create: `src/__tests__/employeeCsvSkippedSerialize.test.ts`

A one-click "download skipped rows as CSV" button is the main usability win of the summary modal. The output must match the input column shape so the user can fix in Excel and re-import.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/employeeCsvSkippedSerialize.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to see it fail**

```bash
npx vitest run src/__tests__/employeeCsvSkippedSerialize.test.ts
```

Expected: FAIL — `skippedRowsToCSV` is not exported.

- [ ] **Step 3: Add the serializer**

Append to `src/lib/employeeCsv.ts`:

```typescript
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
  // `columns` locks the order even when `rows` is empty — a header-only
  // CSV is still useful as a template.
  return Papa.unparse(rows, { header: true, columns: [...SKIPPED_CSV_COLUMNS] })
}
```

- [ ] **Step 4: Run the test to see it pass**

```bash
npx vitest run src/__tests__/employeeCsvSkippedSerialize.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/employeeCsv.ts src/__tests__/employeeCsvSkippedSerialize.test.ts
git commit -m "feat(csv): skippedRowsToCSV serialiser with round-trip parity"
```

---

## Task 6: `uiStore` state for last import summary

**Files:**
- Modify: `src/stores/uiStore.ts`

The summary modal reads from the store rather than taking props so `CSVImportDialog` can close itself (dismissing the textarea + paste) before the summary appears. Same pattern as `conflict` on `projectStore`.

- [ ] **Step 1: Read current uiStore to find the right spot**

```bash
grep -n "csvImportOpen\|setCsvImportOpen" src/stores/uiStore.ts
```

Use the output to find the existing CSV-related fields and add alongside.

- [ ] **Step 2: Add the new state + setter**

In `src/stores/uiStore.ts`:

Add this type near the top of the file (above `interface UIState`):

```typescript
import type { ImportIssue } from '../lib/employeeCsv'

export interface CSVImportSummary {
  importedCount: number
  skipped: ImportIssue[]
  warnings: ImportIssue[]
}
```

Inside the `UIState` interface:

```typescript
  csvImportSummary: CSVImportSummary | null
  setCsvImportSummary: (summary: CSVImportSummary | null) => void
```

Inside the `create<UIState>` body (alongside the other setters):

```typescript
  csvImportSummary: null,
  setCsvImportSummary: (summary) => set({ csvImportSummary: summary }),
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/stores/uiStore.ts
git commit -m "feat(ui): csvImportSummary state for post-import modal"
```

---

## Task 7: `CSVImportSummaryModal` component

**Files:**
- Create: `src/components/editor/CSVImportSummaryModal.tsx`
- Create: `src/__tests__/csvImportSummaryModal.test.tsx`
- Modify: `src/components/editor/ProjectShell.tsx` (mount it)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/csvImportSummaryModal.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CSVImportSummaryModal } from '../components/editor/CSVImportSummaryModal'
import { useUIStore } from '../stores/uiStore'
import type { ImportIssue } from '../lib/employeeCsv'

function issue(over: Partial<ImportIssue> = {}): ImportIssue {
  return {
    rowIndex: over.rowIndex ?? 1,
    reason: over.reason ?? 'blank_name',
    message: over.message ?? 'Missing name',
    raw: over.raw ?? { name: '' },
  }
}

beforeEach(() => {
  useUIStore.setState({ csvImportSummary: null })
})

describe('CSVImportSummaryModal', () => {
  it('renders nothing when there is no summary', () => {
    const { container } = render(<CSVImportSummaryModal />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the imported / skipped / warning counts', () => {
    useUIStore.setState({
      csvImportSummary: {
        importedCount: 197,
        skipped: [issue({ rowIndex: 3 })],
        warnings: [issue({ rowIndex: 7, reason: 'invalid_status' })],
      },
    })
    render(<CSVImportSummaryModal />)
    expect(screen.getByText(/197 imported/i)).toBeInTheDocument()
    expect(screen.getByText(/1 skipped/i)).toBeInTheDocument()
    expect(screen.getByText(/1 warning/i)).toBeInTheDocument()
  })

  it('lists each skipped and warning row with its reason', () => {
    useUIStore.setState({
      csvImportSummary: {
        importedCount: 0,
        skipped: [issue({ rowIndex: 3, reason: 'blank_name' })],
        warnings: [issue({ rowIndex: 7, reason: 'invalid_status', message: 'Unknown status' })],
      },
    })
    render(<CSVImportSummaryModal />)
    expect(screen.getByText(/row 3/i)).toBeInTheDocument()
    expect(screen.getByText(/blank_name/i)).toBeInTheDocument()
    expect(screen.getByText(/row 7/i)).toBeInTheDocument()
    expect(screen.getByText(/invalid_status/i)).toBeInTheDocument()
  })

  it('download button calls downloadCSV with a filename and non-empty CSV', async () => {
    const calls: Array<{ filename: string; csv: string }> = []
    vi.doMock('../lib/employeeCsv', async () => {
      const actual = await vi.importActual<typeof import('../lib/employeeCsv')>('../lib/employeeCsv')
      return {
        ...actual,
        downloadCSV: (filename: string, csv: string) => {
          calls.push({ filename, csv })
          return true
        },
      }
    })
    vi.resetModules()
    const { CSVImportSummaryModal: FreshModal } = await import(
      '../components/editor/CSVImportSummaryModal'
    )
    useUIStore.setState({
      csvImportSummary: {
        importedCount: 0,
        skipped: [issue({ rowIndex: 1 })],
        warnings: [],
      },
    })
    render(<FreshModal />)
    fireEvent.click(screen.getByRole('button', { name: /download skipped/i }))
    expect(calls).toHaveLength(1)
    expect(calls[0].filename).toMatch(/skipped.*\.csv$/i)
    expect(calls[0].csv).toContain('skip_reason')
    vi.doUnmock('../lib/employeeCsv')
  })

  it('Done button clears the summary', () => {
    useUIStore.setState({
      csvImportSummary: {
        importedCount: 1,
        skipped: [],
        warnings: [],
      },
    })
    render(<CSVImportSummaryModal />)
    fireEvent.click(screen.getByRole('button', { name: /^Done$/i }))
    expect(useUIStore.getState().csvImportSummary).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

```bash
npx vitest run src/__tests__/csvImportSummaryModal.test.tsx
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Create the component**

Create `src/components/editor/CSVImportSummaryModal.tsx`:

```tsx
import { useUIStore } from '../../stores/uiStore'
import { downloadCSV, skippedRowsToCSV, type ImportIssue } from '../../lib/employeeCsv'
import { useCallback, useEffect } from 'react'

/**
 * Post-import summary. Blocks the editor until dismissed so users can't
 * accidentally miss that 18 rows didn't land. The modal reads straight
 * from `uiStore.csvImportSummary` rather than props because the import
 * dialog has already closed by the time this shows.
 */
export function CSVImportSummaryModal() {
  const summary = useUIStore((s) => s.csvImportSummary)
  const clear = useUIStore((s) => s.setCsvImportSummary)

  const handleDownload = useCallback(() => {
    if (!summary) return
    const csv = skippedRowsToCSV(summary.skipped)
    const ts = new Date().toISOString().slice(0, 10)
    downloadCSV(`skipped-rows-${ts}.csv`, csv)
  }, [summary])

  const handleDone = useCallback(() => clear(null), [clear])

  useEffect(() => {
    if (!summary) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [summary, handleDone])

  if (!summary) return null

  const { importedCount, skipped, warnings } = summary
  const allIssues: Array<ImportIssue & { kind: 'skipped' | 'warning' }> = [
    ...skipped.map((i) => ({ ...i, kind: 'skipped' as const })),
    ...warnings.map((i) => ({ ...i, kind: 'warning' as const })),
  ].sort((a, b) => a.rowIndex - b.rowIndex)

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-summary-title"
    >
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-xl w-full mx-4">
        <h2 id="csv-summary-title" className="text-lg font-semibold mb-4">
          Import complete
        </h2>
        <div className="flex gap-4 mb-4 text-sm">
          <span className="text-green-700">
            <strong>{importedCount}</strong> imported
          </span>
          <span className="text-red-700">
            <strong>{skipped.length}</strong> skipped
          </span>
          <span className="text-amber-700">
            <strong>{warnings.length}</strong> {warnings.length === 1 ? 'warning' : 'warnings'}
          </span>
        </div>

        {allIssues.length > 0 && (
          <div className="mb-4 max-h-60 overflow-y-auto border border-gray-200 rounded">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left">Row</th>
                  <th className="px-2 py-1 text-left">Reason</th>
                  <th className="px-2 py-1 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {allIssues.map((i, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="px-2 py-1 whitespace-nowrap">
                      Row {i.rowIndex}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      <span
                        className={
                          i.kind === 'skipped'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }
                      >
                        {i.reason}
                      </span>
                    </td>
                    <td className="px-2 py-1">{i.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          {skipped.length > 0 && (
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Download skipped rows (CSV)
            </button>
          )}
          <button
            onClick={handleDone}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Mount the modal in ProjectShell**

In `src/components/editor/ProjectShell.tsx`, import the component and render it alongside the other modals. Find the block that renders `<CSVImportDialog />` and add the summary modal immediately after:

```tsx
import { CSVImportSummaryModal } from './CSVImportSummaryModal'
```

And in the JSX near the existing modals:

```tsx
<CSVImportSummaryModal />
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run src/__tests__/csvImportSummaryModal.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/CSVImportSummaryModal.tsx src/components/editor/ProjectShell.tsx src/__tests__/csvImportSummaryModal.test.tsx
git commit -m "feat(csv): post-import summary modal with skipped-rows download"
```

---

## Task 8: Wire `CSVImportDialog` to the new pipeline

**Files:**
- Modify: `src/components/editor/RightSidebar/CSVImportDialog.tsx`
- Create: `src/__tests__/csvImportDialogFlow.test.tsx`

The dialog still handles file upload + preview. We rewrite `handleImport` to use the new validator + importer + summary modal state.

- [ ] **Step 1: Write the integration test**

Create `src/__tests__/csvImportDialogFlow.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CSVImportDialog } from '../components/editor/RightSidebar/CSVImportDialog'
import { useUIStore } from '../stores/uiStore'
import { useEmployeeStore } from '../stores/employeeStore'

const CSV = [
  'name,email,status,start_date,manager',
  'Alice,alice@co.com,active,2024-01-15,',
  ',ghost@co.com,active,,',
  'Bob,alice@co.com,active,,Alice',
  'Carol,carol@co.com,nope,tomorrow,',
  'Dave,dave@co.com,active,,Nobody',
].join('\n')

beforeEach(() => {
  useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  useUIStore.setState({
    csvImportOpen: true,
    csvImportSummary: null,
  })
})

describe('CSVImportDialog flow', () => {
  it('imports the valid rows and opens a summary modal with skipped + warnings', () => {
    render(<CSVImportDialog />)

    const textarea = screen.getByPlaceholderText(/name,email/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: CSV } })

    fireEvent.click(screen.getByRole('button', { name: /preview/i }))
    fireEvent.click(screen.getByRole('button', { name: /import/i }))

    // Dialog closed, summary modal set.
    expect(useUIStore.getState().csvImportOpen).toBe(false)
    const summary = useUIStore.getState().csvImportSummary
    expect(summary).not.toBeNull()

    // Alice + Carol + Dave import (3). Bob skipped (duplicate email with Alice).
    // Blank row skipped (blank_name). Carol has two warnings (invalid_status,
    // invalid_start_date). Dave has one warning (manager_unresolved).
    expect(summary!.importedCount).toBe(3)
    expect(summary!.skipped.map((s) => s.reason).sort()).toEqual([
      'blank_name',
      'duplicate_email',
    ])
    expect(summary!.warnings.map((w) => w.reason).sort()).toEqual([
      'invalid_start_date',
      'invalid_status',
      'manager_unresolved',
    ])

    // Store should have 3 employees.
    expect(Object.keys(useEmployeeStore.getState().employees)).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

```bash
npx vitest run src/__tests__/csvImportDialogFlow.test.tsx
```

Expected: FAIL — dialog doesn't yet set `csvImportSummary`.

- [ ] **Step 3: Rewrite `handleImport` in the dialog**

Replace the entire `handleImport` callback and its surrounding imports in `src/components/editor/RightSidebar/CSVImportDialog.tsx`:

Imports at the top (replace existing lines 1–4):

```typescript
import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import {
  parseEmployeeCSV,
  CSVTooLargeError,
  validateImportRows,
  importEmployees,
} from '../../../lib/employeeCsv'
import { useState, useCallback, useEffect } from 'react'
```

Remove the now-unused `isEmployeeStatus` import and the `parseEquipmentStatus` local function — that logic now lives in the validator.

Replace the entire `handleImport` with:

```typescript
  const handleImport = useCallback(() => {
    if (!preview) return

    const existing = useEmployeeStore.getState().employees
    // Reduce to the shape validateImportRows expects (id, name, email).
    const existingReduced: Record<
      string,
      { id: string; name: string; email: string | null }
    > = {}
    for (const [id, e] of Object.entries(existing)) {
      existingReduced[id] = { id, name: e.name, email: e.email || null }
    }

    const { valid, skipped, warnings } = validateImportRows(preview.rows, existingReduced)
    const { imported } = importEmployees({
      valid,
      existing: existingReduced,
      addEmployee: addEmployee as never,
      updateEmployee,
    })

    // Hand off to the summary modal and close ourselves. The summary modal
    // is mounted by ProjectShell and reads from uiStore.csvImportSummary.
    useUIStore.getState().setCsvImportSummary({
      importedCount: imported.length,
      skipped,
      warnings,
    })
    setOpen(false)
    setCsvText('')
    setPreview(null)
  }, [preview, addEmployee, updateEmployee, setOpen])
```

- [ ] **Step 4: Run the new test**

```bash
npx vitest run src/__tests__/csvImportDialogFlow.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass. If `employeeCsvRoundTrip.test.ts` regresses it means the validator lost or transformed a field that's supposed to round-trip — fix the validator, not the test.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/RightSidebar/CSVImportDialog.tsx src/__tests__/csvImportDialogFlow.test.tsx
git commit -m "feat(csv): wire dialog to validator + summary modal"
```

---

## Task 9: Large-file smoke test (200 rows with seeded errors)

**Files:**
- Create: `src/__tests__/csvImportLargeFile.test.ts`

The spec's "done when" criterion is a 200-row CSV with seeded errors producing the correct counts. We cover that explicitly so regressions are loud.

- [ ] **Step 1: Write the test**

Create `src/__tests__/csvImportLargeFile.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run src/__tests__/csvImportLargeFile.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/csvImportLargeFile.test.ts
git commit -m "test(csv): 200-row file with seeded errors smoke test"
```

---

## Task 10: Final verification + PR

- [ ] **Step 1: Run the full verification gauntlet**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: all clean. Test count should be ~350 (325 pre-phase + ~23 new).

- [ ] **Step 2: Manual smoke test**

```bash
npm run dev
```

Verify in the browser:
1. Open an office, click **Import** in the roster or right sidebar.
2. Paste a CSV with 5 rows containing: one blank-name, one duplicate email, one invalid status, one invalid start date, one unresolved manager.
3. Click **Preview**, then **Import**.
4. Summary modal appears showing: imported / skipped / warning counts, a per-row list, and (because there's at least one skip) a **Download skipped rows** button.
5. Click **Download skipped rows** — a `skipped-rows-YYYY-MM-DD.csv` file downloads. Open it; first row should contain `skip_reason` as the last column.
6. Click **Done** — modal closes, employee store has the valid rows.
7. Escape key also closes the modal.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/phase2-csv-import-hardening
gh pr create --title "Phase 2: CSV import hardening" --body "$(cat <<'EOF'
## Summary

Phase 2 of the pilot-readiness roadmap: make CSV roster import non-silent.

- Consolidated `parseEmployeeCSV` + `employeesToCSV` into a single `src/lib/employeeCsv.ts` module so export and import can't drift.
- Added `validateImportRows` with reason codes `blank_name`, `duplicate_email`, `invalid_status`, `invalid_start_date`, `manager_unresolved`. Structural issues skip the row; soft issues become warnings with safe fallbacks so the rest of the row still imports.
- Added `importEmployees` pure helper — the old inline two-pass manager resolution moved here, testable without React.
- New `CSVImportSummaryModal` blocks the editor after import and shows imported / skipped / warning counts, a per-row reason list, and a one-click download of the skipped rows as a CSV that matches input column shape (so users can fix in their spreadsheet and re-import in one loop).
- Kept existing behaviors: CSV size cap, row count cap, header aliases, round-trip column parity with export.

Implements Phase 2 of `docs/superpowers/specs/2026-04-23-pilot-readiness-roadmap-design.md`.

## Test plan
- [x] tsc --noEmit clean
- [x] vitest run — full suite passes
- [x] npm run build clean
- [x] Unit: validateImportRows covers every reason code
- [x] Unit: importEmployees resolves manager names across same-import peers
- [x] Unit: skippedRowsToCSV round-trips back through parseEmployeeCSV
- [x] Integration: 200-row seeded-error CSV produces correct counts
- [x] Integration: dialog → validator → import → summary modal end-to-end
- [ ] Manual: paste 5-row error CSV, verify summary modal + download button
- [ ] Manual: downloaded CSV re-imports cleanly after fixing errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Mark the plan complete**

After the PR is open, this plan is done. Return the PR URL to the user.

---

## Out-of-scope (deferred)

Explicitly NOT in Phase 2:
- Re-upload-skipped-rows inside the modal — user re-imports manually via the normal flow.
- Column-mapping UI — header aliases cover the 95% case; anything weirder is rare enough to justify a support ticket.
- Partial-import undo. If the user is unhappy with what imported, they can delete the rows individually or undo via the existing zundo stack.
- Unknown-column detection. PapaParse ignores unknown columns silently; we inherit that.

These may land in later phases if pilot feedback demands them.
