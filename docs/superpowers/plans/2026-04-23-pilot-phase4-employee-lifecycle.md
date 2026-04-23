# Pilot Phase 4 — Employee Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture real leave + departure metadata so HR can track "who is out, until when, with who covering" and "who's departing by when" — not just a status flag.

**Architecture:** Additive fields on `Employee` (5 new nullable fields), back-filled via `migrateEmployees()` in the existing loadAutoSave path. UI surface: a conditional "Leave details" section in `RosterDetailDrawer` that renders when status='on-leave', a `departureDate` input always visible in the drawer, a "Departing soon" filter chip on the roster, and a `DepartingSoonBadge` rendered on rows with upcoming departures.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest + @testing-library/react.

---

## Context for the implementer

Phase 3 (Roster power ops) is in flight (PR #27). Phase 4 stacks on Phase 3 until both land.

### Existing surface area confirmed by codebase survey

- `src/types/employee.ts`:
  ```ts
  export type EmployeeStatus = 'active' | 'on-leave' | 'departed'
  export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = ['active', 'on-leave', 'departed'] as const
  export interface Employee {
    id, name, email, department, team, title, managerId, employmentType,
    status, officeDays, startDate, endDate, equipmentNeeds, equipmentStatus,
    photoUrl, tags, seatId, floorId, createdAt
  }
  ```
  `status`, `endDate`, `startDate` already exist. New fields are purely additive.

- `src/stores/employeeStore.ts` — `addEmployee` (lines 56–83) and `addEmployees` (85–121) create with explicit defaults. `updateEmployee` (123–128) is a generic merge — no changes needed for new fields to work through it.

- `src/lib/offices/loadFromLegacyPayload.ts` — `migrateEmployees()` (lines 89–102) already extends a spread with one field per migration. Same pattern used in Phase 1 for `status`. Add one branch per new field.

- `src/components/editor/RosterDetailDrawer.tsx` — status dropdown at lines 458–473. Form pattern uses `Field()` wrapper (lines 488–497), `defaultValue` + `onBlur` submit for text, `onChange` for selects. Add new section(s) near the status dropdown.

- `src/components/editor/RosterPage.tsx`:
  - Filter chips rendered ~lines 1759–1834. "Ending soon" chip at 1812–1824 uses `withinDays()` helper — copy that shape for "Departing soon".
  - `EndingSoonBadge` component at lines 2028–2057 — copy for `DepartingSoonBadge`.
  - Filter state lives in `active` (URL-synced) — new filter field will follow existing pattern.

- `src/hooks/useCanEdit.ts` — gate every new mutation affordance on `canEdit` same as other drawer fields.

### Design decisions

**Leave metadata is optional even when status='on-leave':** The form fields *show up* conditionally, but they're never required. HR sometimes flips a status without details ready; forcing fields would block that. This matches the existing "inline status dropdown" behavior where flipping status is a single click.

**`departureDate` is independent of status:** An HR Editor sets a scheduled departure weeks in advance while the employee is still `active`. The roadmap spec is explicit: "No automatic status flip; HR flips manually when the day arrives." We honor that — no derived status mutations.

**"Departing soon" uses the same `withinDays()` helper as "Ending soon":** Reuse, not parallel logic. The semantic difference is `endDate` (when your contract ends) vs `departureDate` (when HR plans to offboard you). Both feed the same timeframe heuristic.

**Leave banner only in the drawer, not on rows:** The row has finite horizontal real estate — it already shows status color + ending-soon + equipment-pending. Adding another chip per row would be noisy. Leave metadata lives in the drawer; the status chip already tells the roster reader "this person is out". Revisit in Phase 7 polish if pilot users ask for it.

### Non-goals

- No calendar picker component — the existing `<input type="date">` is enough; adding a custom picker is out-of-scope.
- No cross-employee "coverage map" view — `coverageEmployeeId` is captured but not surfaced as a graph.
- No automation on `departureDate` reaching today — status remains editor-controlled.
- No email / Slack notifications on leave start/end — notifications come in Phase 7.

---

## Task 1: Branch setup

**Files:** none

- [ ] **Step 1: Stack on Phase 3**

```bash
git checkout feat/phase3-roster-power-ops
git pull
git checkout -b feat/phase4-employee-lifecycle
```

- [ ] **Step 2: Verify baseline**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: 368 tests pass (Phase 3 tip), tsc + build clean.

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-04-23-pilot-phase4-employee-lifecycle.md
git commit -m "docs(plan): phase 4 employee lifecycle plan"
```

---

## Task 2: Extend `Employee` type + leave-type enum

**Files:**
- Modify: `src/types/employee.ts`

Pure type additions. No test file for this task — TS + the migration test in Task 4 exercise the shape.

- [ ] **Step 1: Add LeaveType enum and Employee fields**

Read `src/types/employee.ts`. Near `EMPLOYEE_STATUSES`, add:

```typescript
export type LeaveType = 'parental' | 'medical' | 'sabbatical' | 'other'

export const LEAVE_TYPES: readonly LeaveType[] = [
  'parental',
  'medical',
  'sabbatical',
  'other',
] as const
```

Then extend the `Employee` interface — add these fields (keep them together after `endDate` so lifecycle fields cluster):

```typescript
  // Leave metadata (populated when status = 'on-leave'; always optional).
  leaveType: LeaveType | null
  expectedReturnDate: string | null
  coverageEmployeeId: string | null
  leaveNotes: string | null
  // Scheduled departure — independent of status; HR flips status manually
  // when the day arrives.
  departureDate: string | null
```

- [ ] **Step 2: Verify tsc fails where defaults need to be set**

```bash
npx tsc --noEmit
```

Expected: errors in `employeeStore.ts` at `addEmployee` / `addEmployees` — the returned objects are missing the new required fields. Good — that's what Task 3 will fix.

If tsc is clean (e.g., because the store uses `Partial<Employee>`), that's still fine; move on.

- [ ] **Step 3: Commit**

```bash
git add src/types/employee.ts
git commit -m "feat(types): add leave metadata + departureDate to Employee"
```

---

## Task 3: Seed defaults in `employeeStore`

**Files:**
- Modify: `src/stores/employeeStore.ts`

The new fields must default to `null` on every new employee creation path.

- [ ] **Step 1: Patch `addEmployee`**

Read `src/stores/employeeStore.ts` around lines 56–83. Wherever the object literal that becomes the new employee is built, add the five new fields:

```typescript
  leaveType: null,
  expectedReturnDate: null,
  coverageEmployeeId: null,
  leaveNotes: null,
  departureDate: null,
```

Set them unconditionally — callers pass a `Partial<Employee>` so the `...data` spread (if present) will still override if a caller sends them explicitly. If the store uses `data.foo ?? null` pattern for other nullable fields, match it:

```typescript
  leaveType: data.leaveType ?? null,
  expectedReturnDate: data.expectedReturnDate ?? null,
  coverageEmployeeId: data.coverageEmployeeId ?? null,
  leaveNotes: data.leaveNotes ?? null,
  departureDate: data.departureDate ?? null,
```

- [ ] **Step 2: Patch `addEmployees` (bulk)**

Same five fields, same pattern, inside the loop body.

- [ ] **Step 3: Type-check + run the full suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: clean tsc, 368 tests still pass (no behavior change for existing paths — defaults are null).

If tests break because existing fixtures in tests build `Employee` objects without the new fields and pass them through a typed interface, update those fixtures to include `leaveType: null, expectedReturnDate: null, coverageEmployeeId: null, leaveNotes: null, departureDate: null`. Or switch them to `as unknown as Employee` if they're already using that escape hatch.

- [ ] **Step 4: Commit**

```bash
git add src/stores/employeeStore.ts
git commit -m "feat(store): default leave + departure fields to null"
```

---

## Task 4: Migration in `migrateEmployees()`

**Files:**
- Modify: `src/lib/offices/loadFromLegacyPayload.ts`
- Create: `src/__tests__/employeeLifecycleMigration.test.ts`

Back-fill the five new fields for legacy payloads that predate Phase 4.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/employeeLifecycleMigration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'

const SAVE_KEY = 'floocraft-autosave'

function seed(payload: unknown) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
}

const basePayload = {
  project: { id: 'p', slug: 'p', name: 'P' },
  elements: {},
  employees: {},
  departmentColors: {},
  floors: [{ id: 'f', name: 'F', order: 0, elements: {} }],
  activeFloorId: 'f',
  settings: {},
}

describe('migrateEmployees — Phase 4 lifecycle fields', () => {
  it('back-fills all five new fields to null on legacy employees', () => {
    seed({
      ...basePayload,
      employees: {
        e1: {
          id: 'e1',
          name: 'Alice',
          status: 'active',
          // Note: no leaveType / expectedReturnDate / coverageEmployeeId /
          // leaveNotes / departureDate.
        },
      },
    })
    const loaded = loadAutoSave()
    const e1 = loaded?.employees.e1 as Record<string, unknown> | undefined
    expect(e1).toBeDefined()
    expect(e1?.leaveType).toBeNull()
    expect(e1?.expectedReturnDate).toBeNull()
    expect(e1?.coverageEmployeeId).toBeNull()
    expect(e1?.leaveNotes).toBeNull()
    expect(e1?.departureDate).toBeNull()
  })

  it('preserves valid existing values', () => {
    seed({
      ...basePayload,
      employees: {
        e1: {
          id: 'e1',
          name: 'Bob',
          status: 'on-leave',
          leaveType: 'parental',
          expectedReturnDate: '2026-09-01',
          coverageEmployeeId: 'e2',
          leaveNotes: 'Back-up contact: Carol',
          departureDate: null,
        },
      },
    })
    const loaded = loadAutoSave()
    const e1 = loaded?.employees.e1 as Record<string, unknown> | undefined
    expect(e1?.leaveType).toBe('parental')
    expect(e1?.expectedReturnDate).toBe('2026-09-01')
    expect(e1?.coverageEmployeeId).toBe('e2')
    expect(e1?.leaveNotes).toBe('Back-up contact: Carol')
    expect(e1?.departureDate).toBeNull()
  })

  it('coerces invalid leaveType values to null', () => {
    seed({
      ...basePayload,
      employees: {
        e1: { id: 'e1', name: 'Dan', status: 'on-leave', leaveType: 'nonsense' },
      },
    })
    const loaded = loadAutoSave()
    const e1 = loaded?.employees.e1 as Record<string, unknown> | undefined
    expect(e1?.leaveType).toBeNull()
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npx vitest run src/__tests__/employeeLifecycleMigration.test.ts
```

Expected: FAIL — new fields undefined on legacy payloads.

- [ ] **Step 3: Extend `migrateEmployees`**

Read `src/lib/offices/loadFromLegacyPayload.ts` lines 89–102. Add the LeaveType validator near `isEmployeeStatus` (follow the existing shape):

```typescript
import { LEAVE_TYPES, type LeaveType } from '../../types/employee'

function isLeaveType(v: unknown): v is LeaveType {
  return typeof v === 'string' && (LEAVE_TYPES as readonly string[]).includes(v)
}

function isIsoDateLike(v: unknown): v is string {
  // Lenient: we accept any string; the UI shows whatever's there. A strict
  // YYYY-MM-DD parse is out-of-scope — if a legacy payload has garbage, the
  // worst case is the date input shows empty, which is acceptable.
  return typeof v === 'string' && v.length > 0
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
```

Then extend `migrateEmployees()`:

```typescript
function migrateEmployees(employees: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [id, raw] of Object.entries(employees ?? {})) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    out[id] = {
      ...e,
      status: isEmployeeStatus(e.status) ? e.status : 'active',
      leaveType: isLeaveType(e.leaveType) ? e.leaveType : null,
      expectedReturnDate: isIsoDateLike(e.expectedReturnDate) ? e.expectedReturnDate : null,
      coverageEmployeeId: stringOrNull(e.coverageEmployeeId),
      leaveNotes: stringOrNull(e.leaveNotes),
      departureDate: isIsoDateLike(e.departureDate) ? e.departureDate : null,
    }
  }
  return out as ReturnType<typeof useEmployeeStore.getState>['employees']
}
```

If the existing helpers `isEmployeeStatus` or others already handle "string or null" cleanly, reuse them — don't duplicate. Keep the file DRY.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/__tests__/employeeLifecycleMigration.test.ts
```

Expected: 3/3 pass.

- [ ] **Step 5: Full suite + type-check**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Expected: 371 passing (368 + 3). Clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/offices/loadFromLegacyPayload.ts src/__tests__/employeeLifecycleMigration.test.ts
git commit -m "feat(migration): back-fill leave + departure fields to null"
```

---

## Task 5: Leave-details form in `RosterDetailDrawer`

**Files:**
- Modify: `src/components/editor/RosterDetailDrawer.tsx`
- Create: `src/__tests__/leaveMetadata.test.tsx`

When `status === 'on-leave'`, a details section appears: `leaveType` select, `expectedReturnDate` date input, `coverageEmployeeId` combobox (simple datalist over other employees), `leaveNotes` textarea. All fields are optional.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/leaveMetadata.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RosterDetailDrawer } from '../components/editor/RosterDetailDrawer'
import { useEmployeeStore } from '../stores/employeeStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'

function emp(over: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    id: over.id,
    name: over.name,
    email: over.email ?? '',
    department: over.department ?? null,
    team: over.team ?? null,
    title: over.title ?? null,
    managerId: over.managerId ?? null,
    employmentType: over.employmentType ?? 'full-time',
    status: over.status ?? 'active',
    officeDays: over.officeDays ?? [],
    startDate: over.startDate ?? null,
    endDate: over.endDate ?? null,
    equipmentNeeds: over.equipmentNeeds ?? [],
    equipmentStatus: over.equipmentStatus ?? 'not-needed',
    photoUrl: over.photoUrl ?? null,
    tags: over.tags ?? [],
    seatId: over.seatId ?? null,
    floorId: over.floorId ?? null,
    createdAt: over.createdAt ?? new Date().toISOString(),
    leaveType: over.leaveType ?? null,
    expectedReturnDate: over.expectedReturnDate ?? null,
    coverageEmployeeId: over.coverageEmployeeId ?? null,
    leaveNotes: over.leaveNotes ?? null,
    departureDate: over.departureDate ?? null,
  } as Employee
}

beforeEach(() => {
  useEmployeeStore.setState({
    employees: {
      e1: emp({ id: 'e1', name: 'Alice', status: 'on-leave' }),
      e2: emp({ id: 'e2', name: 'Bob', status: 'active' }),
    },
    departmentColors: {},
  } as never)
  useProjectStore.setState({ currentOfficeRole: 'editor' } as never)
})

describe('RosterDetailDrawer — leave metadata', () => {
  it('shows leave details when status is on-leave', () => {
    render(<RosterDetailDrawer employeeId="e1" onClose={() => {}} />)
    expect(screen.getByLabelText(/leave type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/expected return/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/coverage/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/leave notes/i)).toBeInTheDocument()
  })

  it('hides leave details when status is active', () => {
    render(<RosterDetailDrawer employeeId="e2" onClose={() => {}} />)
    expect(screen.queryByLabelText(/leave type/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/expected return/i)).not.toBeInTheDocument()
  })

  it('persists leaveType and expectedReturnDate on change', () => {
    render(<RosterDetailDrawer employeeId="e1" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/leave type/i), { target: { value: 'parental' } })
    fireEvent.change(screen.getByLabelText(/expected return/i), { target: { value: '2026-09-01' } })
    const e1 = useEmployeeStore.getState().employees.e1
    expect(e1.leaveType).toBe('parental')
    expect(e1.expectedReturnDate).toBe('2026-09-01')
  })

  it('persists leaveNotes on blur', () => {
    render(<RosterDetailDrawer employeeId="e1" onClose={() => {}} />)
    const notes = screen.getByLabelText(/leave notes/i) as HTMLTextAreaElement
    fireEvent.change(notes, { target: { value: 'Back-up: Carol' } })
    fireEvent.blur(notes)
    expect(useEmployeeStore.getState().employees.e1.leaveNotes).toBe('Back-up: Carol')
  })
})
```

Note: If `RosterDetailDrawer`'s props are different (e.g., `employee` object instead of `employeeId`, or it expects to be inside a provider), read the current file and adjust. The test intent — fields render conditionally, values persist — is what matters.

- [ ] **Step 2: Run, verify FAIL**

```bash
npx vitest run src/__tests__/leaveMetadata.test.tsx
```

Expected: FAIL — fields don't exist.

- [ ] **Step 3: Add the leave-details section**

Read `src/components/editor/RosterDetailDrawer.tsx`. Locate the status dropdown (~lines 458–473).

Import `LEAVE_TYPES` + `LeaveType`:
```tsx
import { EMPLOYEE_STATUSES, LEAVE_TYPES, type LeaveType } from '../../types/employee'
```

Directly AFTER the status field's closing markup, add a conditional block. Use the existing `Field` wrapper pattern — check the file's convention; if `Field` takes `label` + children, do:

```tsx
{employee.status === 'on-leave' && (
  <>
    <Field label="Leave type" htmlFor="leave-type">
      <select
        id="leave-type"
        value={employee.leaveType ?? ''}
        onChange={(e) =>
          updateEmployee(employee.id, {
            leaveType: (e.target.value || null) as LeaveType | null,
          })
        }
        disabled={!canEdit}
        className="…existing select classes…"
      >
        <option value="">—</option>
        {LEAVE_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </Field>

    <Field label="Expected return" htmlFor="expected-return">
      <input
        id="expected-return"
        type="date"
        defaultValue={employee.expectedReturnDate ?? ''}
        onChange={(e) =>
          updateEmployee(employee.id, {
            expectedReturnDate: e.target.value || null,
          })
        }
        disabled={!canEdit}
        className="…existing input classes…"
      />
    </Field>

    <Field label="Coverage (who's covering)" htmlFor="coverage">
      <input
        id="coverage"
        list="coverage-employees"
        defaultValue={coverageLabel(employee.coverageEmployeeId)}
        onBlur={(e) => {
          const matched = findEmployeeByName(e.target.value)
          updateEmployee(employee.id, {
            coverageEmployeeId: matched?.id ?? null,
          })
        }}
        disabled={!canEdit}
        placeholder="Search by name"
        className="…existing input classes…"
      />
      <datalist id="coverage-employees">
        {Object.values(allEmployees)
          .filter((e) => e.id !== employee.id)
          .map((e) => (
            <option key={e.id} value={e.name} />
          ))}
      </datalist>
    </Field>

    <Field label="Leave notes" htmlFor="leave-notes">
      <textarea
        id="leave-notes"
        defaultValue={employee.leaveNotes ?? ''}
        onBlur={(e) =>
          updateEmployee(employee.id, { leaveNotes: e.target.value || null })
        }
        disabled={!canEdit}
        rows={3}
        className="…existing textarea classes…"
      />
    </Field>
  </>
)}
```

Helpers inside the component:
```tsx
const allEmployees = useEmployeeStore((s) => s.employees)

const coverageLabel = (id: string | null) =>
  id ? allEmployees[id]?.name ?? '' : ''

const findEmployeeByName = (name: string) =>
  Object.values(allEmployees).find((e) => e.name === name.trim()) ?? null
```

Match the existing drawer's class naming exactly — don't invent new classnames. If the drawer uses a `Field` component and you can't find it in the same file, grep for `function Field` in RosterDetailDrawer.tsx or nearby.

- [ ] **Step 4: Run test, verify PASS**

```bash
npx vitest run src/__tests__/leaveMetadata.test.tsx
```

Expected: 4/4 pass. If a test fails because `getByLabelText` can't find the field, it usually means the label text in your rendered markup doesn't match the regex. Adjust either the markup (to match the test's regex) or the test (to match the markup) — but keep the semantic label meaningful ("Leave type", "Expected return", etc.).

- [ ] **Step 5: Full gauntlet**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Expected: 375 passing (371 + 4). Clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/RosterDetailDrawer.tsx src/__tests__/leaveMetadata.test.tsx
git commit -m "feat(roster): leave-details form in drawer when on-leave"
```

---

## Task 6: Departure date + "Departing soon" chip + badge

**Files:**
- Modify: `src/components/editor/RosterDetailDrawer.tsx` (add departureDate field)
- Modify: `src/components/editor/RosterPage.tsx` (add chip, badge, filter logic)
- Create: `src/__tests__/scheduledDeparture.test.tsx`

The `departureDate` input is in the drawer, always visible (no status gate). On the roster page we add a `DepartingSoonBadge` (rendered inline with the row's status / end-date chips) and a "Departing soon" filter chip.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/scheduledDeparture.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RosterPage } from '../components/editor/RosterPage'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'

function emp(over: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    id: over.id,
    name: over.name,
    email: over.email ?? '',
    department: over.department ?? null,
    team: over.team ?? null,
    title: over.title ?? null,
    managerId: over.managerId ?? null,
    employmentType: over.employmentType ?? 'full-time',
    status: over.status ?? 'active',
    officeDays: over.officeDays ?? [],
    startDate: over.startDate ?? null,
    endDate: over.endDate ?? null,
    equipmentNeeds: over.equipmentNeeds ?? [],
    equipmentStatus: over.equipmentStatus ?? 'not-needed',
    photoUrl: over.photoUrl ?? null,
    tags: over.tags ?? [],
    seatId: over.seatId ?? null,
    floorId: over.floorId ?? null,
    createdAt: over.createdAt ?? new Date().toISOString(),
    leaveType: over.leaveType ?? null,
    expectedReturnDate: over.expectedReturnDate ?? null,
    coverageEmployeeId: over.coverageEmployeeId ?? null,
    leaveNotes: over.leaveNotes ?? null,
    departureDate: over.departureDate ?? null,
  } as Employee
}

function withinNextDays(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useEmployeeStore.setState({
    employees: {
      e1: emp({ id: 'e1', name: 'Alice', departureDate: withinNextDays(10) }),
      e2: emp({ id: 'e2', name: 'Bob' }),
      e3: emp({ id: 'e3', name: 'Carol', departureDate: withinNextDays(120) }),
    },
    departmentColors: {},
  } as never)
  useProjectStore.setState({ currentOfficeRole: 'editor' } as never)
})

function renderRoster() {
  return render(
    <MemoryRouter initialEntries={['/t/t1/o/o1/roster']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/roster" element={<RosterPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Scheduled departure', () => {
  it('renders a "Departing" badge on rows with a near-future departureDate', () => {
    renderRoster()
    // Alice departs in 10 days — badge should be visible.
    const row = screen.getByText('Alice').closest('tr')
    expect(row?.textContent?.toLowerCase()).toMatch(/depart/)
  })

  it('does not render a badge on rows without departureDate', () => {
    renderRoster()
    const row = screen.getByText('Bob').closest('tr')
    expect(row?.textContent?.toLowerCase()).not.toMatch(/depart/)
  })

  it('"Departing soon" filter chip narrows the table to upcoming departures within 30 days', () => {
    renderRoster()
    const chip = screen.getByRole('button', { name: /departing soon/i })
    chip.click()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
    // Carol is 120 days out — not "soon".
    expect(screen.queryByText('Carol')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npx vitest run src/__tests__/scheduledDeparture.test.tsx
```

Expected: FAIL — no badge or chip yet.

- [ ] **Step 3: Add `departureDate` input to the drawer**

In `src/components/editor/RosterDetailDrawer.tsx`, near the end-date field (which already exists per survey ~line 384–407), add a sibling field:

```tsx
<Field label="Departure date" htmlFor="departure-date">
  <input
    id="departure-date"
    type="date"
    defaultValue={employee.departureDate ?? ''}
    onChange={(e) =>
      updateEmployee(employee.id, { departureDate: e.target.value || null })
    }
    disabled={!canEdit}
    className="…existing classes…"
  />
</Field>
```

- [ ] **Step 4: Add `DepartingSoonBadge` to RosterPage**

Read `src/components/editor/RosterPage.tsx` lines 2028–2057 for the existing `EndingSoonBadge`. Copy the shape into a new component just below it:

```tsx
function DepartingSoonBadge({ departureDate, todayLabel }: { departureDate: string | null; todayLabel: string }) {
  if (!departureDate) return null
  // Reuse the same "within 30 days" heuristic that EndingSoonBadge uses —
  // find where `withinDays` is defined and share it. If it's local to
  // EndingSoonBadge, extract it to a module-level helper.
  if (!withinDays(departureDate, 30)) return null

  const label = formatDepartureLabel(departureDate, todayLabel)
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
      {label}
    </span>
  )
}

function formatDepartureLabel(iso: string, todayLabel: string): string {
  const d = new Date(iso)
  const today = new Date()
  const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Departing today'
  if (diffDays === 1) return 'Departing tomorrow'
  if (diffDays <= 7) return `Departing in ${diffDays}d`
  // Otherwise show "Departing Mon Jun 2"
  const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return `Departing ${fmt.format(d)}`
}
```

Render it in the same table cell / PersonCard row where `EndingSoonBadge` is rendered:

```tsx
<EndingSoonBadge endDate={emp.endDate} todayLabel={todayLabel} />
<DepartingSoonBadge departureDate={emp.departureDate} todayLabel={todayLabel} />
```

(If the row's class layout needs a gap between badges, match the existing `gap-x-1` / `ml-1` style used next to EndingSoonBadge.)

- [ ] **Step 5: Add "Departing soon" filter chip**

In the chips bar (lines 1759–1834), after the "Ending soon" chip, add:

```tsx
{stats.departingSoon > 0 &&
  chip(
    'Departing soon',
    stats.departingSoon,
    active.presetFilter === 'departing-soon',
    () =>
      onSetFilter(
        'preset',
        active.presetFilter === 'departing-soon' ? '' : 'departing-soon',
      ),
    'amber',
  )}
```

The chip is preset-based so it lives next to "Ending soon". Add the preset to whatever `presetFilter` union exists. If presets are typed as a union literal, extend it with `'departing-soon'`.

In the stats-computation block (the one producing `stats.onLeave`, `stats.unassigned`, etc.), add:

```tsx
const departingSoon = list.filter(
  (e) => e.departureDate && withinDays(e.departureDate, 30),
).length
```

In the filter-application block (where other presetFilter branches filter `list`), add:

```tsx
if (active.presetFilter === 'departing-soon') {
  list = list.filter(
    (e) => e.departureDate && withinDays(e.departureDate, 30),
  )
}
```

If `withinDays` is scoped to a component internal and not exported, hoist it to module scope or a local helper file — both the stats and the filter consume it. Don't duplicate the logic.

- [ ] **Step 6: Run tests, verify PASS**

```bash
npx vitest run src/__tests__/scheduledDeparture.test.tsx
```

Expected: 3/3 pass.

If the "chip narrows the table" test fails because the rendering of `<tr>` rows doesn't strip filtered employees the way the test expects, double-check that the filter is applied BEFORE sort/slice in the same pipeline the other filters use. A very common mistake: adding the filter in a separate `useMemo` that isn't part of the same derived list.

- [ ] **Step 7: Full gauntlet**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Expected: 378 passing (375 + 3). Clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/editor/RosterDetailDrawer.tsx src/components/editor/RosterPage.tsx src/__tests__/scheduledDeparture.test.tsx
git commit -m "feat(roster): departure date field, badge, and filter chip"
```

---

## Task 7: Final verification + PR

- [ ] **Step 1: Gauntlet**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: ~378 tests passing, tsc + build clean.

- [ ] **Step 2: Manual smoke**

```bash
npm run dev
```

1. Open the drawer on an `active` employee — no leave-details visible, but Departure-date field is visible and editable.
2. Flip the status to `on-leave` inline in the drawer — the leave-details block appears. Fill in type + expected return + notes + coverage. Close the drawer, reopen — values persist.
3. Flip status back to `active` — leave-details hide (values are retained in store, just not shown).
4. Set a departure date 10 days out — an amber "Departing in 10d" badge appears on the row.
5. Click "Departing soon" chip — table filters to only rows with a departure within 30 days.
6. Simulate a legacy payload: manually edit `localStorage.floocraft-autosave` to remove the new fields from an employee; refresh; confirm no crash, all fields read as null.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/phase4-employee-lifecycle
gh pr create --base feat/phase3-roster-power-ops --title "Phase 4: Employee lifecycle — leave metadata + scheduled departure" --body "$(cat <<'EOF'
## Summary

Phase 4 of the pilot-readiness roadmap: capture real attrition + leave tracking, not just status flips.

- **Leave metadata** — five new optional fields on `Employee`: `leaveType` (parental/medical/sabbatical/other), `expectedReturnDate`, `coverageEmployeeId`, `leaveNotes`, plus an independent `departureDate`.
- **Conditional drawer section** — when status='on-leave', the detail drawer reveals leave-type select, return-date picker, coverage combobox (datalist of other employees), and a notes textarea. Hides again if status flips away.
- **Departure date** — always visible in the drawer (independent of status).
- **"Departing soon" badge** on the roster — amber chip rendered inline when `departureDate` is within 30 days. Label degrades from "Departing today" / "tomorrow" / "in Nd" → "Departing Mon Jun 2".
- **"Departing soon" filter chip** narrows the table to employees with a departure within 30 days.
- **Legacy migration** — `migrateEmployees()` back-fills all five new fields to null, coerces invalid `leaveType` values to null, preserves valid existing values.

Stacked on PR #27 (Phase 3). Base retargets to main once upstream lands.

## Implementation notes

- No automatic status flip when `departureDate` reaches today — HR flips manually (per roadmap spec).
- Leave banner lives in the drawer only, not on rows (row real estate is already busy with status + ending-soon + equipment-pending; pilot-user feedback in Phase 7 will tell us whether to add a row chip).
- `withinDays()` helper was hoisted to module scope so both stats + filter + badge share one source of truth.

## Test plan

- [x] `npx tsc --noEmit` clean
- [x] `npx vitest run` — ~378 tests pass (368 baseline + 3 migration + 4 leave metadata + 3 departure)
- [x] `npm run build` clean
- [x] Unit: migration back-fills all 5 fields to null; preserves valid values; coerces invalid leaveType
- [x] Integration: drawer shows leave details when status='on-leave', hides when 'active'
- [x] Integration: leave fields persist through updateEmployee
- [x] Integration: Departing-soon badge renders for rows within 30 days; absent for rows without departureDate
- [x] Integration: Departing-soon chip narrows the table
- [ ] Manual: flip status to on-leave, fill metadata, refresh — persists
- [ ] Manual: set departureDate 10 days out — badge visible, chip filter works
- [ ] Manual: load a legacy payload in localStorage — no crash, fields read as null

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Done**

Return the PR URL. Mark this plan complete.

---

## Out-of-scope (deferred)

- Automatic status flip when `departureDate` reaches today (HR flips manually).
- Cross-employee "who's covering whom" graph view.
- Email/Slack notifications for leave start/end (Phase 7).
- Row-level leave chips (drawer-only for now).
- Custom date-picker component (native `<input type="date">` is sufficient).
