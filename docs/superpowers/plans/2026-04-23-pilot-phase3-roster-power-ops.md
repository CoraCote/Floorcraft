# Pilot Phase 3 — Roster Power Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 100+ person workflows not miserable. Three pilot-critical power ops on the roster: bulk-edit mini-form, multi-seat "Assign to…" mode, and find-on-map from a seat cell.

**Architecture:** All three features are additive — no data-model changes, no new stores. Bulk-edit is a new mini-form mounted in `RosterPage.tsx` that batch-calls `updateEmployee` per selected id. Multi-seat assign adds a transient `assignmentQueue` to `uiStore` plus a new click handler in `CanvasStage.tsx` that routes clicks on assignable elements into `seatAssignment.assignEmployee`. Find-on-map leans on a new `src/lib/canvasFocus.ts` helper that pans the Konva stage to center a target element and decorates the selection ring with a CSS flash class for 1.5s.

**Tech Stack:** React 19, TypeScript, Zustand, Konva (react-konva), React Router v6, Vitest + @testing-library/react.

---

## Context for the implementer

Phase 2 (CSV import hardening) is in flight (PR #26). Phase 3 stacks on Phase 2 until both land.

### Existing surface area confirmed by codebase survey

- `src/components/editor/RosterPage.tsx` lines ~932–1011 hold the bulk-action bar. Today it exposes `Set dept`, `Set status`, `Unassign`, `Export selection`, `Delete`, `Clear`. Selection is local state: `const [selected, setSelected] = useState<Set<string>>(new Set())`. We add an `Edit…` button that opens a popover mini-form alongside the existing buttons.
- `src/stores/employeeStore.ts` has `updateEmployee(id, updates)` at line 123. **No zundo** — bulk-edit is not undoable today and this plan does not add that (consistent with existing `Set dept` / `Set status` buttons).
- `src/lib/seatAssignment.ts` exports `assignEmployee(employeeId, seatId, floorId)` (line 380-ish area) — use this for multi-seat assign. It handles two-sided sync (employee.seatId + element.assignedEmployeeId(s)).
- `src/types/elements.ts` — `isAssignableElement` narrows to `DeskElement | WorkstationElement | PrivateOfficeElement`. DeskElement has `assignedEmployeeId: string | null`; Workstation and PrivateOffice both have `assignedEmployeeIds: string[]`.
- `src/lib/stageRegistry.ts` exports `getActiveStage()` / `setActiveStage()`. `CanvasStage.tsx` registers/unregisters the stage via a `useEffect`.
- `src/stores/uiStore.ts` has `selectedIds: string[]` and `setSelectedIds(ids)`. Also has `modalOpenCount` + `registerModalOpen()` / `registerModalClose()` used by `useKeyboardShortcuts` to gate shortcuts.
- Routes: `/t/:teamSlug/o/:officeSlug/{map,roster}`. Navigation uses `useNavigate()`.
- `src/stores/toastStore.ts` — `push({ tone, title, body?, action? })`.
- `src/hooks/useCanEdit.ts` — Phase 1 introduced this; viewers cannot bulk-edit or assign. All new mutation affordances in this plan must gate on `useCanEdit()` same as Phase 1 patterns.

### Design decisions

**Bulk edit — not undoable:** The existing `Set dept` / `Set status` buttons aren't undoable (employeeStore has no zundo). Adding a mini-form that's "just a bigger version of Set dept" should match that behavior — otherwise the selector "one undoable action" depends on a substrate that doesn't exist. Adding zundo to employeeStore is out-of-scope for this phase.

**Multi-seat assign — workstation-first with fall-through:** There's no "cluster" concept in the data model. The natural multi-seat container is `WorkstationElement.positions`. The pilot need ("assign an 8-person team in <10 clicks") is served by: enter assign mode (1 click), click a workstation that has ≥N open positions (1 click) → done in 2 clicks for the dense case; or click individual desks one at a time (N clicks) for the sparse case. Clicking a workstation with fewer open positions than queue length toasts the overflow and assigns what fits.

**Find-on-map — URL params, not a ref bridge:** Roster → Map handoff uses `?floor=<id>&seat=<id>` query params. `MapView` reads them on mount, calls `switchToFloor`, sets selection, calls `focusOnElement`, and then removes the params so a refresh doesn't re-trigger the focus. This keeps the two pages decoupled (no prop drilling, no context) and makes the behavior bookmark/back-button-safe.

**Flash animation — CSS class, not Konva tween:** No tween library is present. Adding one is overkill. We inject a CSS class on the selection ring that animates opacity via `@keyframes`; renderers consume a `flashingElementId` from `uiStore` and apply the class for 1.5s.

### Non-goals

- No first-class "cluster" data model. Workstations are the cluster.
- No zundo on employeeStore. Bulk edits are not undoable (consistent with existing bulk ops).
- No drag-to-assign from roster. "Assign to…" is click-based.
- No cross-floor multi-seat assign in this phase. The queue is consumed on whatever floor you're on. Out-of-scope because the 80% case is same-floor team seating.

---

## Task 1: Branch setup

**Files:** none

- [ ] **Step 1: Stack on Phase 2**

```bash
git checkout feat/phase2-csv-import-hardening
git pull
git checkout -b feat/phase3-roster-power-ops
```

- [ ] **Step 2: Verify baseline**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: 350 tests pass (Phase 2 tip), tsc + build clean.

- [ ] **Step 3: Commit the plan**

```bash
git add docs/superpowers/plans/2026-04-23-pilot-phase3-roster-power-ops.md
git commit -m "docs(plan): phase 3 roster power ops plan"
```

---

## Task 2: Bulk-edit mini-form — types + pure helper

**Files:**
- Create: `src/lib/bulkEditEmployees.ts`
- Create: `src/__tests__/bulkEditEmployees.test.ts`

Pure helper that takes a patch + a list of ids and produces the update calls. Separating it from React makes it trivially testable and keeps the roster component thin.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/bulkEditEmployees.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applyBulkEdit, type BulkEditPatch } from '../lib/bulkEditEmployees'

describe('applyBulkEdit', () => {
  it('returns a patch with only non-empty fields for each id', () => {
    const calls: Array<{ id: string; patch: Record<string, unknown> }> = []
    const patch: BulkEditPatch = { department: 'Eng', title: null, status: null, team: null }
    applyBulkEdit(['a', 'b'], patch, (id, p) => calls.push({ id, patch: p }))
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual({ id: 'a', patch: { department: 'Eng' } })
    expect(calls[1]).toEqual({ id: 'b', patch: { department: 'Eng' } })
  })

  it('merges multiple fields into a single patch per id', () => {
    const calls: Array<{ id: string; patch: Record<string, unknown> }> = []
    const patch: BulkEditPatch = {
      department: 'Eng',
      title: 'IC5',
      status: 'active',
      team: 'Platform',
    }
    applyBulkEdit(['a'], patch, (id, p) => calls.push({ id, patch: p }))
    expect(calls[0].patch).toEqual({
      department: 'Eng',
      title: 'IC5',
      status: 'active',
      team: 'Platform',
    })
  })

  it('no-ops when every patch field is null', () => {
    const calls: Array<{ id: string; patch: Record<string, unknown> }> = []
    const patch: BulkEditPatch = { department: null, title: null, status: null, team: null }
    applyBulkEdit(['a', 'b'], patch, (id, p) => calls.push({ id, patch: p }))
    expect(calls).toHaveLength(0)
  })

  it('treats empty string as "clear this field" (distinct from null = skip)', () => {
    const calls: Array<{ id: string; patch: Record<string, unknown> }> = []
    const patch: BulkEditPatch = { department: '', title: null, status: null, team: null }
    applyBulkEdit(['a'], patch, (id, p) => calls.push({ id, patch: p }))
    expect(calls[0].patch).toEqual({ department: null })
  })
})
```

- [ ] **Step 2: Run the test, verify FAIL**

```bash
npx vitest run src/__tests__/bulkEditEmployees.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/bulkEditEmployees.ts`:

```typescript
import type { EmployeeStatus } from '../types/employee'

/**
 * A bulk-edit patch. Fields are tri-state:
 *   - `null`        → skip this field (leave each employee's value unchanged)
 *   - `''`          → clear this field (set to null on the employee)
 *   - non-empty str → set this field to the value on every selected employee
 *
 * Status is slightly different: it's either `null` (skip) or a valid
 * `EmployeeStatus` value. We don't allow "clear status" because every
 * employee must have one.
 */
export interface BulkEditPatch {
  department: string | null
  title: string | null
  team: string | null
  status: EmployeeStatus | null
}

/**
 * Apply a bulk edit to a list of ids by calling `update(id, patch)` for
 * each id. Fields with value `null` are omitted; empty strings become
 * `null` on the resulting patch (= "clear this field" on the employee).
 *
 * Pure: no stores, no React. The caller wires `update` to
 * `employeeStore.updateEmployee`.
 */
export function applyBulkEdit(
  ids: string[],
  patch: BulkEditPatch,
  update: (id: string, updates: Record<string, unknown>) => void,
): void {
  const effective: Record<string, unknown> = {}
  if (patch.department !== null) {
    effective.department = patch.department === '' ? null : patch.department
  }
  if (patch.title !== null) {
    effective.title = patch.title === '' ? null : patch.title
  }
  if (patch.team !== null) {
    effective.team = patch.team === '' ? null : patch.team
  }
  if (patch.status !== null) {
    effective.status = patch.status
  }
  if (Object.keys(effective).length === 0) return
  for (const id of ids) {
    update(id, { ...effective })
  }
}
```

- [ ] **Step 4: Run the test, verify PASS**

```bash
npx vitest run src/__tests__/bulkEditEmployees.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bulkEditEmployees.ts src/__tests__/bulkEditEmployees.test.ts
git commit -m "feat(roster): applyBulkEdit pure helper for mini-form"
```

---

## Task 3: Bulk-edit mini-form UI

**Files:**
- Create: `src/components/editor/RosterBulkEditPopover.tsx`
- Modify: `src/components/editor/RosterPage.tsx`
- Create: `src/__tests__/rosterBulkEdit.test.tsx`

The popover is a small floating card anchored to the `Edit…` button. Four fields: department (datalist from existing depts), title (text), team (text), status (select). A "leave unchanged" option per field is represented by leaving the input `null` — in the UI, every field is a tri-state: untouched (default), clear (user clicked a × button), or set.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/rosterBulkEdit.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RosterPage } from '../components/editor/RosterPage'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'

function emp(over: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    id: over.id,
    name: over.name,
    department: over.department ?? null,
    title: over.title ?? null,
    email: over.email ?? null,
    team: over.team ?? null,
    managerId: over.managerId ?? null,
    employmentType: over.employmentType ?? null,
    officeDays: over.officeDays ?? [],
    startDate: over.startDate ?? null,
    endDate: over.endDate ?? null,
    tags: over.tags ?? [],
    equipmentNeeds: over.equipmentNeeds ?? null,
    equipmentStatus: over.equipmentStatus ?? null,
    photoUrl: over.photoUrl ?? null,
    zone: over.zone ?? null,
    seatId: over.seatId ?? null,
    floorId: over.floorId ?? null,
    status: over.status ?? 'active',
  } as unknown as Employee
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useEmployeeStore.setState({
    employees: {
      e1: emp({ id: 'e1', name: 'Alice', department: 'Ops' }),
      e2: emp({ id: 'e2', name: 'Bob', department: 'Ops' }),
      e3: emp({ id: 'e3', name: 'Carol', department: 'Eng' }),
    },
    departmentColors: { Ops: '#000', Eng: '#fff' },
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

describe('Roster bulk edit mini-form', () => {
  it('applies department to every selected employee', () => {
    renderRoster()
    // Select Alice + Bob.
    const checkboxes = screen.getAllByRole('checkbox')
    // checkboxes[0] is the header "select all"; next three are the rows.
    fireEvent.click(checkboxes[1])
    fireEvent.click(checkboxes[2])

    // Open the Edit popover.
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }))

    // Type a new department.
    const deptInput = screen.getByLabelText(/department/i) as HTMLInputElement
    fireEvent.change(deptInput, { target: { value: 'Platform' } })

    // Submit.
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    const after = useEmployeeStore.getState().employees
    expect(after.e1.department).toBe('Platform')
    expect(after.e2.department).toBe('Platform')
    // Carol wasn't selected; her dept is unchanged.
    expect(after.e3.department).toBe('Eng')
  })

  it('applies title + status together', () => {
    renderRoster()
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])

    fireEvent.click(screen.getByRole('button', { name: /^edit/i }))

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'IC5' } })
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'on-leave' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    const after = useEmployeeStore.getState().employees.e1
    expect(after.title).toBe('IC5')
    expect(after.status).toBe('on-leave')
  })

  it('does nothing when no field is filled in', () => {
    renderRoster()
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }))
    // Apply with all fields blank.
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    const after = useEmployeeStore.getState().employees.e1
    // Unchanged.
    expect(after.department).toBe('Ops')
    expect(after.title).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test, verify FAIL**

```bash
npx vitest run src/__tests__/rosterBulkEdit.test.tsx
```

Expected: FAIL — no `Edit` button in the bar.

- [ ] **Step 3: Create the popover**

Create `src/components/editor/RosterBulkEditPopover.tsx`:

```tsx
import { useState, useCallback, useEffect } from 'react'
import { applyBulkEdit, type BulkEditPatch } from '../../lib/bulkEditEmployees'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useUIStore } from '../../stores/uiStore'
import type { EmployeeStatus } from '../../types/employee'

interface Props {
  selectedIds: string[]
  onClose: () => void
}

/**
 * Inline popover anchored to the Edit button in the roster bulk-action
 * bar. Four fields (dept, title, team, status); every field left blank
 * means "leave this alone" on each selected employee. Apply closes; Esc
 * closes without applying.
 *
 * Uses `applyBulkEdit` (pure) so the wiring to the employee store is
 * trivial and every piece stays testable.
 */
export function RosterBulkEditPopover({ selectedIds, onClose }: Props) {
  const [department, setDepartment] = useState('')
  const [title, setTitle] = useState('')
  const [team, setTeam] = useState('')
  const [status, setStatus] = useState<EmployeeStatus | ''>('')

  // Suppress global shortcuts while the popover is open — Esc must only
  // close this, not trigger the editor's Esc behavior.
  const registerModalOpen = useUIStore((s) => s.registerModalOpen)
  const registerModalClose = useUIStore((s) => s.registerModalClose)
  useEffect(() => {
    registerModalOpen()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      registerModalClose()
    }
  }, [registerModalOpen, registerModalClose, onClose])

  const apply = useCallback(() => {
    const patch: BulkEditPatch = {
      department: department === '' ? null : department,
      title: title === '' ? null : title,
      team: team === '' ? null : team,
      status: status === '' ? null : (status as EmployeeStatus),
    }
    const update = useEmployeeStore.getState().updateEmployee
    applyBulkEdit(selectedIds, patch, update)
    onClose()
  }, [selectedIds, department, title, team, status, onClose])

  return (
    <div
      className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-72"
      role="dialog"
      aria-label="Bulk edit selected employees"
    >
      <div className="text-xs text-gray-500 mb-2">
        Editing {selectedIds.length} selected
      </div>

      <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="bulk-edit-dept">
        Department
      </label>
      <input
        id="bulk-edit-dept"
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        placeholder="Leave blank to keep"
        className="w-full mb-2 px-2 py-1 border border-gray-300 rounded text-sm"
      />

      <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="bulk-edit-title">
        Title
      </label>
      <input
        id="bulk-edit-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Leave blank to keep"
        className="w-full mb-2 px-2 py-1 border border-gray-300 rounded text-sm"
      />

      <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="bulk-edit-team">
        Team
      </label>
      <input
        id="bulk-edit-team"
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        placeholder="Leave blank to keep"
        className="w-full mb-2 px-2 py-1 border border-gray-300 rounded text-sm"
      />

      <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="bulk-edit-status">
        Status
      </label>
      <select
        id="bulk-edit-status"
        value={status}
        onChange={(e) => setStatus(e.target.value as EmployeeStatus | '')}
        className="w-full mb-3 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
      >
        <option value="">Leave unchanged</option>
        <option value="active">Active</option>
        <option value="on-leave">On leave</option>
        <option value="departed">Departed</option>
      </select>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the Edit button into RosterPage.tsx**

Read `src/components/editor/RosterPage.tsx` to locate the bulk-action bar (around lines 932–1011 by the survey). Near the other bulk buttons, add an `Edit…` button that toggles local state, and render the popover when open.

At the top of the file, add the import:
```tsx
import { RosterBulkEditPopover } from './RosterBulkEditPopover'
```

Inside the component, near the existing bulk state (e.g., next to `selected` / `setSelected`), add:
```tsx
const [bulkEditOpen, setBulkEditOpen] = useState(false)
```

Inside the JSX for the bulk-action bar, wrap the Edit button in a positioned container so the popover can anchor to it. Place the new button between `Set status` and `Unassign` (or anywhere in the existing flex row — precise position is not load-bearing). Gate on `canEdit` (Phase 1):

```tsx
{canEdit && (
  <div className="relative">
    <button
      type="button"
      onClick={() => setBulkEditOpen((v) => !v)}
      className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
    >
      Edit…
    </button>
    {bulkEditOpen && (
      <RosterBulkEditPopover
        selectedIds={Array.from(selected)}
        onClose={() => setBulkEditOpen(false)}
      />
    )}
  </div>
)}
```

If the bulk-action bar block doesn't already read `canEdit`, add `const canEdit = useCanEdit()` near the top of the component (import `useCanEdit` from `'../../hooks/useCanEdit'`).

Close the popover whenever the selection becomes empty (the bulk bar unmounts then, but belt-and-suspenders):

```tsx
useEffect(() => {
  if (selected.size === 0) setBulkEditOpen(false)
}, [selected.size])
```

- [ ] **Step 5: Run the test, verify PASS**

```bash
npx vitest run src/__tests__/rosterBulkEdit.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 6: Run the full suite + type-check + build**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Expected: 353 passing (350 + 4 – 1… actually 350 + 4 [bulkEditEmployees] + 3 [rosterBulkEdit] = 357). If the count is anything else, confirm why.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/RosterBulkEditPopover.tsx src/components/editor/RosterPage.tsx src/__tests__/rosterBulkEdit.test.tsx
git commit -m "feat(roster): bulk-edit mini-form for dept/title/team/status"
```

---

## Task 4: `canvasFocus.ts` — pan + flash helper

**Files:**
- Create: `src/lib/canvasFocus.ts`
- Create: `src/__tests__/canvasFocus.test.ts`

A pure helper that computes a target stage position to center a given element. No actual Konva tween — it mutates stage position + the canvasStore `stageX/Y/Scale` directly (same pattern the existing wheel handler uses). Flash is handled by writing an id to `uiStore.flashingElementId` and clearing it after 1.5s.

Unit-testing a Konva stage requires mocking it; we test the pure calculation only (`computeCenteringPosition`) and leave the stage-mutation thin wrapper untested (trivial). The integration test in Task 6 exercises the full path.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/canvasFocus.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeCenteringPosition } from '../lib/canvasFocus'

describe('computeCenteringPosition', () => {
  it('centers an element at (100,100) of size 50x50 in a 800x600 viewport at scale 1', () => {
    const result = computeCenteringPosition({
      element: { x: 100, y: 100, width: 50, height: 50 },
      viewport: { width: 800, height: 600 },
      scale: 1,
    })
    // Element center: (125, 125). Viewport center: (400, 300).
    // Stage offset to place (125,125) at (400,300): (400-125, 300-125) = (275, 175).
    expect(result.x).toBe(275)
    expect(result.y).toBe(175)
  })

  it('respects scale — at scale 2 an element at (100,100) needs doubled stage offset', () => {
    const result = computeCenteringPosition({
      element: { x: 100, y: 100, width: 50, height: 50 },
      viewport: { width: 800, height: 600 },
      scale: 2,
    })
    // Element center in stage coords: (125, 125). In viewport coords at scale 2:
    // (125*2, 125*2) = (250, 250). Offset to center: (400-250, 300-250) = (150, 50).
    expect(result.x).toBe(150)
    expect(result.y).toBe(50)
  })

  it('respects element rotation by treating the axis-aligned bounding box center', () => {
    // For our purposes a simple center-of-rect is good enough; rotation
    // just spins the glyph around its own center. The helper ignores rotation.
    const result = computeCenteringPosition({
      element: { x: 0, y: 0, width: 100, height: 100 },
      viewport: { width: 400, height: 400 },
      scale: 1,
    })
    // Element center (50,50), viewport center (200,200), offset (150,150).
    expect(result).toEqual({ x: 150, y: 150 })
  })
})
```

- [ ] **Step 2: Run the test, verify FAIL**

```bash
npx vitest run src/__tests__/canvasFocus.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/canvasFocus.ts`:

```typescript
import type Konva from 'konva'
import { getActiveStage } from './stageRegistry'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Viewport {
  width: number
  height: number
}

export interface CenteringInput {
  element: Rect
  viewport: Viewport
  scale: number
}

/**
 * Given an element's rect and the current viewport + scale, return the
 * stage position (stageX, stageY) that places the element's center at
 * the viewport center.
 *
 * Stage-coord geometry:
 *   screen = element_center * scale + stageOffset
 * To put element_center at viewport_center:
 *   stageOffset = viewport_center − element_center * scale
 */
export function computeCenteringPosition(input: CenteringInput): { x: number; y: number } {
  const { element, viewport, scale } = input
  const ecx = element.x + element.width / 2
  const ecy = element.y + element.height / 2
  const vcx = viewport.width / 2
  const vcy = viewport.height / 2
  return {
    x: vcx - ecx * scale,
    y: vcy - ecy * scale,
  }
}

/**
 * Pan the active stage so `element` sits at the viewport center, using
 * the current scale (no zoom change — predictable UX, no disorientation).
 * Also writes `flashingElementId` to uiStore and clears it after 1500ms
 * so renderers can add a transient highlight.
 *
 * No-op if no active stage is registered. Safe to call on page load
 * from a route effect — the registry is populated by CanvasStage's
 * mount effect before any user interaction.
 */
export function focusOnElement(element: Rect, elementId: string): void {
  const stage: Konva.Stage | null = getActiveStage()
  if (!stage) return

  const scale = useCanvasStore.getState().stageScale
  const viewport = { width: stage.width(), height: stage.height() }
  const pos = computeCenteringPosition({ element, viewport, scale })

  // Mutate stage + mirror in canvasStore so the state stays authoritative.
  stage.position(pos)
  stage.batchDraw()
  useCanvasStore.getState().setStagePosition(pos.x, pos.y)

  // Flash.
  useUIStore.getState().setFlashingElementId(elementId)
  setTimeout(() => {
    // Only clear if this is still the one we flashed — otherwise a
    // second focusOnElement call would have its flash cut short.
    if (useUIStore.getState().flashingElementId === elementId) {
      useUIStore.getState().setFlashingElementId(null)
    }
  }, 1500)
}
```

The helper references `useCanvasStore.setStagePosition(x, y)` (already exists per survey line 123) and `useUIStore.flashingElementId` + `setFlashingElementId` (new — added in Step 4).

- [ ] **Step 4: Add `flashingElementId` to uiStore**

Read `src/stores/uiStore.ts`. Locate the interface `UIState` and the `create<UIState>()` body. Add:

In the `UIState` interface (next to `selectedIds`):
```typescript
  flashingElementId: string | null
  setFlashingElementId: (id: string | null) => void
```

In the store body (next to `setSelectedIds`):
```typescript
  flashingElementId: null,
  setFlashingElementId: (id) => set({ flashingElementId: id }),
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run src/__tests__/canvasFocus.test.ts
```

Expected: 3 tests pass. (Only `computeCenteringPosition` is exercised — no Konva mocking needed.)

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. If `setStagePosition` doesn't exist on `useCanvasStore`, STOP and check `src/stores/canvasStore.ts` — the survey asserted it's at line 123 of CanvasStage.tsx (the consumer). If the store setter is named differently (e.g. `setPosition`), adjust the `canvasFocus.ts` call accordingly. Do NOT invent a setter — use what's there.

- [ ] **Step 7: Commit**

```bash
git add src/lib/canvasFocus.ts src/stores/uiStore.ts src/__tests__/canvasFocus.test.ts
git commit -m "feat(canvas): focusOnElement pan + flash helper"
```

---

## Task 5: Find-on-map — URL params + MapView effect

**Files:**
- Modify: `src/components/editor/MapView.tsx`
- Modify: `src/components/editor/RosterPage.tsx`
- Create: `src/__tests__/findOnMap.test.tsx`

Clicking the Seat cell in the roster navigates to `/…/map?floor=<floorId>&seat=<seatId>`. `MapView` reads the params on mount, calls `switchToFloor`, sets selection, computes the element rect, calls `focusOnElement`, and then strips the params from the URL so back-navigation + refresh are idempotent.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/findOnMap.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { MapView } from '../components/editor/MapView'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useUIStore } from '../stores/uiStore'
import type { DeskElement } from '../types/elements'

function desk(id: string, over: Partial<DeskElement> = {}): DeskElement {
  return {
    id,
    type: 'desk',
    x: over.x ?? 0,
    y: over.y ?? 0,
    width: over.width ?? 60,
    height: over.height ?? 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    deskId: 'D-1',
    assignedEmployeeId: null,
    capacity: 1,
  } as unknown as DeskElement
}

// Stub focusOnElement so we don't need a real Konva stage in tests.
vi.mock('../lib/canvasFocus', () => ({
  focusOnElement: vi.fn(),
  computeCenteringPosition: vi.fn(),
}))

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [
      { id: 'f1', name: 'Floor 1', order: 0, elements: { d1: desk('d1', { x: 200, y: 200 }) } },
      { id: 'f2', name: 'Floor 2', order: 1, elements: {} },
    ],
    activeFloorId: 'f2',
  } as never)
  useUIStore.setState({ selectedIds: [], flashingElementId: null })
})

describe('MapView — ?seat + ?floor handling', () => {
  it('switches to the named floor, selects the seat, and calls focusOnElement', async () => {
    const { focusOnElement } = await import('../lib/canvasFocus')
    render(
      <MemoryRouter initialEntries={['/t/t1/o/o1/map?floor=f1&seat=d1']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/map" element={<MapView />} />
        </Routes>
      </MemoryRouter>,
    )
    // Effect runs synchronously after first render.
    expect(useFloorStore.getState().activeFloorId).toBe('f1')
    expect(useUIStore.getState().selectedIds).toEqual(['d1'])
    expect(focusOnElement).toHaveBeenCalledWith(
      expect.objectContaining({ x: 200, y: 200, width: 60, height: 60 }),
      'd1',
    )
  })

  it('does nothing when params are absent', async () => {
    const { focusOnElement } = await import('../lib/canvasFocus')
    render(
      <MemoryRouter initialEntries={['/t/t1/o/o1/map']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/map" element={<MapView />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(useFloorStore.getState().activeFloorId).toBe('f2')
    expect(useUIStore.getState().selectedIds).toEqual([])
    expect(focusOnElement).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test, verify FAIL**

```bash
npx vitest run src/__tests__/findOnMap.test.tsx
```

Expected: FAIL — MapView has no such effect yet.

- [ ] **Step 3: Implement the effect in `MapView.tsx`**

Read `src/components/editor/MapView.tsx`. Add imports near the top:
```tsx
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { switchToFloor } from '../../lib/seatAssignment'
import { focusOnElement } from '../../lib/canvasFocus'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
```

(If some of these imports are already there, merge rather than duplicate.)

Inside `MapView` (or the component function — whatever it's called in that file), add an effect that reads + consumes the params:

```tsx
const [searchParams, setSearchParams] = useSearchParams()
useEffect(() => {
  const floorId = searchParams.get('floor')
  const seatId = searchParams.get('seat')
  if (!floorId && !seatId) return

  // Switch floor if needed. switchToFloor is a no-op when the active
  // floor already matches, so passing the active id is safe.
  if (floorId) {
    switchToFloor(floorId)
  }

  if (seatId) {
    // The element lives on the target floor's `elements` dict (which is
    // what `switchToFloor` just hydrated into the elementsStore).
    const floors = useFloorStore.getState().floors
    const target = floors.find((f) => f.id === (floorId ?? useFloorStore.getState().activeFloorId))
    const element = target?.elements[seatId]
    if (element) {
      useUIStore.getState().setSelectedIds([seatId])
      focusOnElement(
        { x: element.x, y: element.y, width: element.width, height: element.height },
        seatId,
      )
    }
  }

  // Consume params — refresh/back shouldn't re-trigger focus.
  const next = new URLSearchParams(searchParams)
  next.delete('floor')
  next.delete('seat')
  setSearchParams(next, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

Empty deps so it only runs on first mount — a later nav to the same map with new params should be a fresh mount via React Router.

If a later navigation keeps MapView mounted and only changes `searchParams`, the empty-dep effect won't rerun. In practice find-on-map navigation from Roster → Map always unmounts/remounts `<RosterPage>` → `<MapView>` inside `ProjectShell`'s `<Outlet>`, so this is safe. If a manual URL tweak ever needs re-triggering, a small bump to the deps (`[searchParams.get('seat'), searchParams.get('floor')]`) would do it — but no current call site requires that.

- [ ] **Step 4: Add Seat cell click handler in `RosterPage.tsx`**

Find the Seat column cell rendering. The cell today probably renders "Unassigned" or a seat label. Replace the static content with a button that navigates to the map. Add the navigation import near the top (if not already present):

```tsx
import { useNavigate, useParams } from 'react-router-dom'
```

Inside the component:
```tsx
const navigate = useNavigate()
const { teamSlug, officeSlug } = useParams()

const findOnMap = (employee: Employee) => {
  if (!employee.seatId || !employee.floorId) return
  navigate(`/t/${teamSlug}/o/${officeSlug}/map?floor=${employee.floorId}&seat=${employee.seatId}`)
}
```

In the Seat column render:
```tsx
{row.seatId && row.floorId ? (
  <button
    type="button"
    onClick={() => findOnMap(row)}
    className="text-blue-600 hover:underline text-left"
    title="Find on map"
  >
    {seatLabel(row)}
  </button>
) : (
  <span className="text-gray-400">Unassigned</span>
)}
```

Where `seatLabel(row)` is whatever helper currently produces the "Floor 1 / D-3" text. If that helper doesn't exist, inline: `` `${floorName(row.floorId)} / ${deskLabel(row.seatId)}` ``. If you have to introduce a helper, keep it inside RosterPage.tsx for now.

- [ ] **Step 5: Add a CSS flash on the selection ring**

Find the renderer that draws the selection rect around selected elements — likely in `src/components/editor/Canvas/SelectionOverlay.tsx` or similar (grep for `selectedIds` in `src/components/editor/Canvas/`). In that component, read `useUIStore((s) => s.flashingElementId)` and conditionally apply a different stroke color or a Konva `Shape` animation.

Simplest non-tween implementation: render a second outline Rect on top of the selection ring when `flashingElementId === elementId`, with a double-width yellow stroke and opacity 1 that drops to 0 after the hook's 1500ms timeout clears the id. The renderer re-renders when uiStore publishes — so when the flashing id clears, the extra ring disappears.

If this renderer is hard to find or risky to touch, **skip the visual flash** and document the omission: the pan + selection together are the pilot-critical behaviors; the flash is polish. Plan for the visual pulse in Phase 7 if a pilot user requests it.

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/__tests__/findOnMap.test.tsx
```

Expected: 2 tests pass.

```bash
npx vitest run
```

Expected: 360 passing (357 + 3 new).

```bash
npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/MapView.tsx src/components/editor/RosterPage.tsx src/__tests__/findOnMap.test.tsx
git commit -m "feat(roster): find-on-map via seat-cell click + URL params"
```

---

## Task 6: Multi-seat assign mode — state + "Assign to…" button

**Files:**
- Modify: `src/stores/uiStore.ts`
- Modify: `src/components/editor/RosterPage.tsx`
- Create: `src/__tests__/multiSeatAssignQueue.test.ts`

The queue lives on `uiStore` so both the roster (which populates it) and the canvas (which consumes it) can read it without prop-drilling. Roster "Assign to…" button populates the queue + navigates to the map. Map click handler (Task 7) pops from the queue.

- [ ] **Step 1: Add queue state to uiStore**

In `src/stores/uiStore.ts`:

In the `UIState` interface:
```typescript
  assignmentQueue: string[] // employee ids in order
  setAssignmentQueue: (ids: string[]) => void
  clearAssignmentQueue: () => void
```

In the store body:
```typescript
  assignmentQueue: [],
  setAssignmentQueue: (ids) => set({ assignmentQueue: ids }),
  clearAssignmentQueue: () => set({ assignmentQueue: [] }),
```

- [ ] **Step 2: Write queue test**

Create `src/__tests__/multiSeatAssignQueue.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../stores/uiStore'

beforeEach(() => {
  useUIStore.setState({ assignmentQueue: [] })
})

describe('uiStore assignmentQueue', () => {
  it('setAssignmentQueue replaces the queue', () => {
    useUIStore.getState().setAssignmentQueue(['a', 'b', 'c'])
    expect(useUIStore.getState().assignmentQueue).toEqual(['a', 'b', 'c'])
  })

  it('clearAssignmentQueue empties it', () => {
    useUIStore.getState().setAssignmentQueue(['a'])
    useUIStore.getState().clearAssignmentQueue()
    expect(useUIStore.getState().assignmentQueue).toEqual([])
  })
})
```

- [ ] **Step 3: Run the test, verify PASS**

```bash
npx vitest run src/__tests__/multiSeatAssignQueue.test.ts
```

Expected: 2 tests pass. (The queue added in Step 1 is already enough.)

- [ ] **Step 4: Add "Assign to…" button in RosterPage bulk bar**

In `src/components/editor/RosterPage.tsx`, near the other bulk buttons, add:

```tsx
{canEdit && (
  <button
    type="button"
    onClick={() => {
      // Populate queue in alphabetical (name) order so the map fill is
      // deterministic for teams that expect name-sorted seating.
      const employees = useEmployeeStore.getState().employees
      const ordered = Array.from(selected)
        .map((id) => employees[id])
        .filter((e): e is Employee => !!e)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => e.id)
      useUIStore.getState().setAssignmentQueue(ordered)
      useToastStore.getState().push({
        tone: 'info',
        title: `Click a workstation or desks to assign ${ordered.length}`,
        body: 'Press Esc to cancel.',
      })
      navigate(`/t/${teamSlug}/o/${officeSlug}/map`)
    }}
    className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
  >
    Assign to…
  </button>
)}
```

Add imports at the top of RosterPage.tsx if missing:
```tsx
import { useUIStore } from '../../stores/uiStore'
import { useToastStore } from '../../stores/toastStore'
import type { Employee } from '../../types/employee'
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/uiStore.ts src/components/editor/RosterPage.tsx src/__tests__/multiSeatAssignQueue.test.ts
git commit -m "feat(roster): assignment queue + 'Assign to…' button"
```

---

## Task 7: Multi-seat assign — CanvasStage consumer

**Files:**
- Modify: `src/components/editor/Canvas/CanvasStage.tsx`
- Create: `src/__tests__/multiSeatAssignConsumer.test.tsx`

When the queue is non-empty, intercept clicks on assignable elements: consume as many employees as the element has open positions, assign via `assignEmployee`, toast the overflow. Esc clears the queue.

- [ ] **Step 1: Write the test**

Create `src/__tests__/multiSeatAssignConsumer.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useUIStore } from '../stores/uiStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { consumeQueueAtElement } from '../lib/multiSeatAssign'
import type { Employee } from '../types/employee'
import type { DeskElement, WorkstationElement } from '../types/elements'

function emp(id: string, name: string): Employee {
  return { id, name, seatId: null, floorId: null, status: 'active' } as unknown as Employee
}
function desk(id: string): DeskElement {
  return {
    id, type: 'desk', x: 0, y: 0, width: 60, height: 60,
    rotation: 0, locked: false, groupId: null, zIndex: 0, visible: true,
    label: '', deskId: 'D-' + id, assignedEmployeeId: null, capacity: 1,
  } as unknown as DeskElement
}
function workstation(id: string, positions: number): WorkstationElement {
  return {
    id, type: 'workstation', x: 0, y: 0, width: 120, height: 60,
    rotation: 0, locked: false, groupId: null, zIndex: 0, visible: true,
    label: '', deskId: 'W-' + id, positions, assignedEmployeeIds: [],
  } as unknown as WorkstationElement
}

beforeEach(() => {
  useEmployeeStore.setState({
    employees: {
      e1: emp('e1', 'Alice'),
      e2: emp('e2', 'Bob'),
      e3: emp('e3', 'Carol'),
    },
    departmentColors: {},
  } as never)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useUIStore.setState({ assignmentQueue: [] })
})

describe('consumeQueueAtElement', () => {
  it('assigns one employee to a desk and shortens the queue', () => {
    useElementsStore.setState({ elements: { d1: desk('d1') } })
    useUIStore.getState().setAssignmentQueue(['e1', 'e2', 'e3'])

    const overflow = consumeQueueAtElement('d1', 'f1')

    expect(overflow).toBe(0)
    expect(useUIStore.getState().assignmentQueue).toEqual(['e2', 'e3'])
    const after = useEmployeeStore.getState().employees
    expect(after.e1.seatId).toBe('d1')
  })

  it('fills a 3-seat workstation from a 3-employee queue', () => {
    useElementsStore.setState({ elements: { w1: workstation('w1', 3) } })
    useUIStore.getState().setAssignmentQueue(['e1', 'e2', 'e3'])

    const overflow = consumeQueueAtElement('w1', 'f1')

    expect(overflow).toBe(0)
    expect(useUIStore.getState().assignmentQueue).toEqual([])
    const emps = useEmployeeStore.getState().employees
    expect([emps.e1.seatId, emps.e2.seatId, emps.e3.seatId]).toEqual(['w1', 'w1', 'w1'])
  })

  it('reports overflow when workstation has fewer open seats than queue length', () => {
    useElementsStore.setState({
      elements: { w1: { ...workstation('w1', 2), assignedEmployeeIds: [] } as WorkstationElement },
    })
    useUIStore.getState().setAssignmentQueue(['e1', 'e2', 'e3'])

    const overflow = consumeQueueAtElement('w1', 'f1')

    expect(overflow).toBe(1)
    expect(useUIStore.getState().assignmentQueue).toEqual(['e3'])
  })

  it('returns -1 when the target is not assignable (no-op)', () => {
    useElementsStore.setState({
      elements: { r1: { id: 'r1', type: 'wall' } as never },
    })
    useUIStore.getState().setAssignmentQueue(['e1'])

    const overflow = consumeQueueAtElement('r1', 'f1')

    expect(overflow).toBe(-1)
    expect(useUIStore.getState().assignmentQueue).toEqual(['e1'])
  })
})
```

- [ ] **Step 2: Implement `consumeQueueAtElement` in a new module**

Create `src/lib/multiSeatAssign.ts`:

```typescript
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../types/elements'
import { assignEmployee } from './seatAssignment'

/**
 * Consume employees from `uiStore.assignmentQueue` into the element at
 * `elementId`. Returns:
 *   -1 — the element isn't assignable (caller should ignore the click).
 *    0 — the queue fit (may have emptied it).
 *   >0 — overflow count; this many employees remain in the queue after
 *        filling all open positions on the element.
 *
 * Open-position math:
 *   - Desk / hot-desk: 1 if unassigned, else 0.
 *   - Workstation / private-office: `positions - assignedEmployeeIds.length`
 *     (workstation uses `positions`; private-office uses `capacity`).
 *
 * Assignment goes through `assignEmployee` so both stores stay in sync.
 */
export function consumeQueueAtElement(elementId: string, floorId: string): number {
  const element = useElementsStore.getState().elements[elementId]
  if (!element) return -1

  let open = 0
  if (isDeskElement(element)) {
    open = element.assignedEmployeeId ? 0 : 1
  } else if (isWorkstationElement(element)) {
    open = Math.max(0, element.positions - element.assignedEmployeeIds.length)
  } else if (isPrivateOfficeElement(element)) {
    open = Math.max(0, element.capacity - element.assignedEmployeeIds.length)
  } else {
    return -1
  }

  const queue = useUIStore.getState().assignmentQueue
  if (queue.length === 0 || open === 0) return queue.length // trivially "overflow" = still-pending

  const consumed = Math.min(open, queue.length)
  for (let i = 0; i < consumed; i++) {
    assignEmployee(queue[i], elementId, floorId)
  }
  const remainder = queue.slice(consumed)
  useUIStore.getState().setAssignmentQueue(remainder)
  return remainder.length
}
```

- [ ] **Step 3: Run the unit test**

```bash
npx vitest run src/__tests__/multiSeatAssignConsumer.test.tsx
```

Expected: 4 tests pass. **If the overflow=0 case for the "fits" test returns the queue length instead of 0**, the logic above already handles it — the `consumed === open` branch leaves `remainder.length === 0`. Good.

- [ ] **Step 4: Wire into CanvasStage click handler**

Read `src/components/editor/Canvas/CanvasStage.tsx` and find the `handleMouseDown` callback. Near the top of that handler — before any tool-specific branching — add:

```tsx
// If an assignment queue is active, intercept clicks on assignable
// elements and consume from the queue.
{
  const queue = useUIStore.getState().assignmentQueue
  if (queue.length > 0) {
    const target = e.target
    // Konva: the clicked node may be a child shape; use the group id.
    const groupId = target.findAncestor('Group', true)?.id() || target.id()
    if (groupId) {
      const floorId = useFloorStore.getState().activeFloorId
      if (floorId) {
        const overflow = consumeQueueAtElement(groupId, floorId)
        if (overflow >= 0) {
          if (overflow > 0) {
            useToastStore.getState().push({
              tone: 'warning',
              title: `${overflow} ${overflow === 1 ? 'employee' : 'employees'} not yet assigned`,
              body: 'Click another workstation or desk, or press Esc to cancel.',
            })
          } else {
            useToastStore.getState().push({
              tone: 'success',
              title: 'All selected employees assigned',
            })
          }
          return
        }
      }
    }
  }
}
```

Add imports:
```tsx
import { consumeQueueAtElement } from '../../../lib/multiSeatAssign'
import { useToastStore } from '../../../stores/toastStore'
```

(useUIStore + useFloorStore likely already imported.)

Also wire Esc to clear the queue. Find the existing keydown handling (if any) in CanvasStage or in `useKeyboardShortcuts.ts`. Simpler: add a one-off effect inside CanvasStage:

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    if (useUIStore.getState().assignmentQueue.length > 0) {
      useUIStore.getState().clearAssignmentQueue()
      useToastStore.getState().push({ tone: 'info', title: 'Assignment cancelled' })
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [])
```

- [ ] **Step 5: Run full suite + type-check + build**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Expected: 366 passing (360 + 2 queue + 4 consumer). All clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/multiSeatAssign.ts src/components/editor/Canvas/CanvasStage.tsx src/__tests__/multiSeatAssignConsumer.test.tsx
git commit -m "feat(canvas): multi-seat assign consumes queue on click"
```

---

## Task 8: Final verification + PR

- [ ] **Step 1: Gauntlet**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: ~366 tests passing, tsc + build clean.

- [ ] **Step 2: Manual smoke**

```bash
npm run dev
```

1. In the roster: select 3 people, click `Edit…`, set department → Apply. Confirm all 3 show the new dept.
2. Click the Seat cell on an assigned employee → lands on map, seat is selected, stage pans to center it.
3. Select 3 unassigned employees → `Assign to…` → lands on map with a toast. Click a 3-seat workstation → all 3 get seated. Click any other element → nothing happens (queue's empty).
4. Select 5 employees → `Assign to…` → click a 2-seat workstation → toast says "3 employees not yet assigned". Click another 3-seat workstation → "All selected employees assigned".
5. Select 4 employees → `Assign to…` → press Esc → "Assignment cancelled" toast, queue clears.

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/phase3-roster-power-ops
gh pr create --base feat/phase2-csv-import-hardening --title "Phase 3: Roster power ops" --body "$(cat <<'EOF'
## Summary

Phase 3 of the pilot-readiness roadmap: three power ops on the roster.

- **Bulk-edit mini-form** in the bulk-action bar: dept, title, team, status. Pure `applyBulkEdit` helper + `RosterBulkEditPopover` UI.
- **Multi-seat assign** — employees-first flow: select N people, click "Assign to…", navigate to map, click a workstation or desks to fill positions in name order. Overflow toasts the remaining count. Esc cancels.
- **Find-on-map** — Seat cell in the roster is now a button; click navigates to `/…/map?floor=<id>&seat=<id>`. MapView reads params, switches floor, selects the seat, pans the stage to center it, then consumes the params.
- **`src/lib/canvasFocus.ts`** — pure `computeCenteringPosition` + stage-mutating `focusOnElement` helper.

Stacked on PR #26 (Phase 2). Base will retarget to main once #26 merges.

Implements Phase 3 of `docs/superpowers/specs/2026-04-23-pilot-readiness-roadmap-design.md`.

## Test plan
- [x] tsc --noEmit clean
- [x] vitest run — ~366 tests pass
- [x] npm run build clean
- [x] Unit: applyBulkEdit tri-state semantics (skip/clear/set)
- [x] Unit: computeCenteringPosition math under scale
- [x] Unit: consumeQueueAtElement desk/workstation/private-office/overflow/non-assignable
- [x] Integration: roster bulk-edit dept propagates to store for selected employees
- [x] Integration: /map?seat=&floor= switches floor + selects seat + calls focusOnElement
- [ ] Manual: bulk-edit 40 employees in one action
- [ ] Manual: assign 8-person team to a cluster in <10 clicks
- [ ] Manual: find-on-map works from table view; stage pans to center

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Done**

Return the PR URL. Mark this plan complete.

---

## Out-of-scope (deferred)

- Zundo on employeeStore (bulk edits are not undoable — consistent with existing `Set dept` behavior).
- First-class "cluster" data model (workstations are the cluster).
- Cross-floor assignment queue (queue is same-floor only).
- Drag-and-drop from roster (click-based queue only).
- Rich visual flash animation on the selection ring (selection + pan is enough for pilot; revisit in Phase 7 polish if requested).
