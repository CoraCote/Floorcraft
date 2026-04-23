# Phase 1: Safety Papercuts + Viewer Role — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four safety fixes (floor-delete confirm, team-member-remove confirm, desk-rename uniqueness, undo-with-data-loss toast) and enforce the existing `OfficeRole = 'owner' | 'editor' | 'viewer'` model across the editor, roster, and map UI so pilot customers aren't "everyone is admin."

**Architecture:** A new `useCanEdit()` hook reads the current user's office role from `projectStore.currentOfficeRole` (populated by `ProjectShell` when loading the office). Every mutating UI call site consults the hook to disable buttons + show a tooltip. Safety dialogs adopt the existing `ConfirmDialog` component (replacing two `window.confirm()` call sites). Uniqueness validation lives in a pure helper so tests are straightforward. Undo-with-data-loss is detected via a zundo subscription that diffs the restored element's assignment against the current employee store.

**Tech Stack:** React 19, TypeScript, Zustand (+ zundo for undo), Supabase (existing `office_permissions` table), Vitest + React Testing Library.

---

## Spec reference

Implements Phase 1 of `docs/superpowers/specs/2026-04-23-pilot-readiness-roadmap-design.md`. Branch off current `main` (post-PR #24).

## File structure

**New files:**
- `src/hooks/useCanEdit.ts` — hook returning `boolean` from `projectStore.currentOfficeRole`.
- `src/lib/elements/deskIdValidation.ts` — pure `isDeskIdAvailable(id, floorElements, selfElementId)` helper.
- `src/lib/offices/currentUserOfficeRole.ts` — async fetch: given officeId + userId → OfficeRole (falls back to `'editor'` for team members without an override, matches `permissionsRepository.ts` semantics).
- `src/stores/toastStore.ts` — minimal toast store (`items: ToastItem[]`, `push(item)`, `dismiss(id)`).
- `src/components/common/Toaster.tsx` — renders the toast list fixed bottom-right.
- `src/hooks/useUndoDataLossToast.ts` — subscribes to zundo and fires a toast when undo restores an assignable element whose assignment was lost.
- Tests:
  - `src/__tests__/useCanEdit.test.tsx`
  - `src/__tests__/deskIdValidation.test.ts`
  - `src/__tests__/currentUserOfficeRole.test.ts`
  - `src/__tests__/toastStore.test.ts`
  - `src/__tests__/floorDeleteConfirm.test.tsx`
  - `src/__tests__/teamMemberRemoveConfirm.test.tsx`
  - `src/__tests__/deskRenameUniqueness.test.tsx`
  - `src/__tests__/undoDataLossToast.test.tsx`
  - `src/__tests__/viewerRoleGating.test.tsx`

**Modified files:**
- `src/stores/projectStore.ts` — add `currentOfficeRole: OfficeRole | null` + `setCurrentOfficeRole` action.
- `src/components/editor/ProjectShell.tsx` — after `loadOffice`, fetch the caller's role via `currentUserOfficeRole` and write it to the store; also mount `<Toaster />` and `useUndoDataLossToast()`.
- `src/components/editor/FloorSwitcher.tsx` — replace `window.confirm()` with inline `ConfirmDialog` state; disable add/delete/rename when `!canEdit`.
- `src/components/team/TeamSettingsMembers.tsx` — replace native `confirm()` with `ConfirmDialog`.
- `src/components/editor/RightSidebar/PropertiesPanel.tsx` — desk-rename uniqueness validation with inline error + disable inputs when `!canEdit`.
- `src/components/editor/LeftSidebar/ElementLibrary.tsx` — disable library tiles when `!canEdit`.
- `src/components/editor/Canvas/CanvasStage.tsx` — early-return from edit handlers (drag, drop, delete, transform) when `!canEdit`; tool toolbar still visible but selection-only.
- `src/components/editor/RosterPage.tsx` — disable inline edit cells, bulk actions, add/import/export when `!canEdit`.
- `src/components/editor/RosterDetailDrawer.tsx` — disable all fields when `!canEdit`.
- `src/components/editor/PeoplePanel.tsx` — disable drag when `!canEdit`.

---

## Task 1: Branch setup

- [ ] **Step 1: Verify clean working tree + on main**

Run:
```bash
git status
git log -1 --oneline
```
Expected: `nothing to commit, working tree clean` and HEAD at `db452d2` or later.

- [ ] **Step 2: Create feature branch**

Run:
```bash
git checkout -b feat/phase1-safety-and-viewer-role
```
Expected: `Switched to a new branch 'feat/phase1-safety-and-viewer-role'`.

---

## Task 2: Minimal toast store

**Files:**
- Create: `src/stores/toastStore.ts`
- Test: `src/__tests__/toastStore.test.ts`

**Why:** Undo-with-data-loss needs a non-modal notification. Future phases will reuse this (CSV import warnings, bulk-op feedback). Kept small on purpose — no stacking animation, no positioning options, no variant-specific styling beyond color.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/toastStore.test.ts`:

```typescript
import { useToastStore } from '../stores/toastStore'

beforeEach(() => {
  useToastStore.setState({ items: [] })
})

describe('toastStore', () => {
  it('pushes a toast with a generated id', () => {
    const id = useToastStore.getState().push({ tone: 'info', title: 'Hi' })
    expect(typeof id).toBe('string')
    expect(useToastStore.getState().items).toHaveLength(1)
    expect(useToastStore.getState().items[0]).toMatchObject({ tone: 'info', title: 'Hi', id })
  })

  it('dismisses by id', () => {
    const id = useToastStore.getState().push({ tone: 'warning', title: 'Heads up' })
    useToastStore.getState().dismiss(id)
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('caps items at 3 (drops oldest)', () => {
    const s = useToastStore.getState()
    s.push({ tone: 'info', title: 'A' })
    s.push({ tone: 'info', title: 'B' })
    s.push({ tone: 'info', title: 'C' })
    s.push({ tone: 'info', title: 'D' })
    const titles = useToastStore.getState().items.map((i) => i.title)
    expect(titles).toEqual(['B', 'C', 'D'])
  })

  it('supports an optional action with a callback', () => {
    const onClick = vi.fn()
    useToastStore.getState().push({
      tone: 'warning',
      title: 'Something',
      action: { label: 'Fix', onClick },
    })
    useToastStore.getState().items[0].action?.onClick()
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/toastStore.test.ts`
Expected: FAIL with "Cannot find module '../stores/toastStore'".

- [ ] **Step 3: Implement the toast store**

Create `src/stores/toastStore.ts`:

```typescript
import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  tone: ToastTone
  title: string
  body?: string
  action?: ToastAction
}

interface ToastState {
  items: ToastItem[]
  push: (item: Omit<ToastItem, 'id'>) => string
  dismiss: (id: string) => void
}

// Cap at 3 visible toasts — drops oldest when a 4th arrives. Avoids
// stacks of stale notifications eating the screen during bulk actions.
const MAX_TOASTS = 3

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (item) => {
    const id = nanoid()
    set((state) => {
      const next = [...state.items, { ...item, id }]
      return { items: next.slice(-MAX_TOASTS) }
    })
    return id
  },
  dismiss: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
}))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/toastStore.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/stores/toastStore.ts src/__tests__/toastStore.test.ts
git commit -m "feat(toasts): minimal toast store with 3-item cap"
```

---

## Task 3: Toaster component (renders the toast list)

**Files:**
- Create: `src/components/common/Toaster.tsx`

**Why:** Pair component for Task 2. Renders fixed bottom-right, auto-dismisses after 5s per item, supports one inline action button.

- [ ] **Step 1: Implement the Toaster**

Create `src/components/common/Toaster.tsx`:

```typescript
import { useEffect } from 'react'
import { useToastStore, type ToastTone } from '../../stores/toastStore'

const AUTO_DISMISS_MS = 5000

const toneClasses: Record<ToastTone, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  success: 'bg-green-50 border-green-200 text-green-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  error: 'bg-red-50 border-red-200 text-red-900',
}

export function Toaster() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)

  useEffect(() => {
    if (items.length === 0) return
    // Each toast auto-dismisses independently. We re-register a timer
    // every render keyed on the ids we see; dismissing one mid-flight
    // just removes it from the list and the timer no-ops.
    const timers = items.map((item) =>
      setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS),
    )
    return () => {
      timers.forEach(clearTimeout)
    }
    // Intentionally re-runs on items identity change.
  }, [items, dismiss])

  if (items.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`border rounded-lg shadow px-3 py-2 text-sm ${toneClasses[item.tone]}`}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="font-medium">{item.title}</div>
              {item.body && <div className="text-xs mt-0.5 opacity-80">{item.body}</div>}
            </div>
            <button
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="text-current opacity-50 hover:opacity-100 leading-none"
            >
              ×
            </button>
          </div>
          {item.action && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => {
                  item.action!.onClick()
                  dismiss(item.id)
                }}
                className="text-xs font-medium underline hover:no-underline"
              >
                {item.action.label}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Mount in ProjectShell**

Modify `src/components/editor/ProjectShell.tsx`. Add import:

```typescript
import { Toaster } from '../common/Toaster'
```

Inside the returned JSX, below `{employeeDirectoryOpen && <EmployeeDirectory />}` and above the `{conflict && ...}` block, add:

```typescript
      <Toaster />
```

- [ ] **Step 3: Run build + tests to verify no regressions**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All green.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/Toaster.tsx src/components/editor/ProjectShell.tsx
git commit -m "feat(toasts): Toaster component mounted in ProjectShell"
```

---

## Task 4: `currentUserOfficeRole` fetcher + test

**Files:**
- Create: `src/lib/offices/currentUserOfficeRole.ts`
- Test: `src/__tests__/currentUserOfficeRole.test.ts`

**Why:** `listPermissions` returns all team members; we only need the caller's role and we don't want to load every member on every office load. This is the focused variant.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/currentUserOfficeRole.test.ts`:

```typescript
import { currentUserOfficeRole } from '../lib/offices/currentUserOfficeRole'

vi.mock('../lib/supabase', () => {
  // Minimal mock chain that shapes the Supabase API surface we use. The
  // test below resets `mockResult` per-case to drive the branches without
  // a real client.
  const mockResult = { data: null as unknown, error: null as unknown }
  const chain = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(mockResult)),
  }
  return { supabase: chain, __mockResult: mockResult }
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const supabaseMock = require('../lib/supabase') as {
  __mockResult: { data: unknown; error: unknown }
}

beforeEach(() => {
  supabaseMock.__mockResult.data = null
  supabaseMock.__mockResult.error = null
})

describe('currentUserOfficeRole', () => {
  it("returns the explicit office_permissions role when one exists", async () => {
    supabaseMock.__mockResult.data = { role: 'viewer' }
    const role = await currentUserOfficeRole('office-1', 'user-1')
    expect(role).toBe('viewer')
  })

  it('falls back to "editor" when no explicit override exists', async () => {
    supabaseMock.__mockResult.data = null
    const role = await currentUserOfficeRole('office-1', 'user-1')
    expect(role).toBe('editor')
  })

  it('returns null on Supabase error (caller treats as unknown → permissive)', async () => {
    supabaseMock.__mockResult.error = new Error('boom')
    const role = await currentUserOfficeRole('office-1', 'user-1')
    expect(role).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/currentUserOfficeRole.test.ts`
Expected: FAIL with "Cannot find module '../lib/offices/currentUserOfficeRole'".

- [ ] **Step 3: Implement the fetcher**

Create `src/lib/offices/currentUserOfficeRole.ts`:

```typescript
import { supabase } from '../supabase'
import type { OfficeRole } from './permissionsRepository'

/**
 * Returns the caller's role for the given office:
 *  - explicit `office_permissions` row wins,
 *  - otherwise defaults to `'editor'` (matches `listPermissions` semantics),
 *  - network/SQL errors return null so the caller can choose a permissive
 *    fallback rather than accidentally locking everyone out.
 */
export async function currentUserOfficeRole(
  officeId: string,
  userId: string,
): Promise<OfficeRole | null> {
  const { data, error } = await supabase
    .from('office_permissions')
    .select('role')
    .eq('office_id', officeId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return null
  const explicit = (data as { role?: string } | null)?.role
  if (explicit === 'owner' || explicit === 'editor' || explicit === 'viewer') {
    return explicit
  }
  return 'editor'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/currentUserOfficeRole.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/offices/currentUserOfficeRole.ts src/__tests__/currentUserOfficeRole.test.ts
git commit -m "feat(rbac): currentUserOfficeRole fetcher"
```

---

## Task 5: `currentOfficeRole` on projectStore + ProjectShell wire-up

**Files:**
- Modify: `src/stores/projectStore.ts`
- Modify: `src/components/editor/ProjectShell.tsx`

- [ ] **Step 1: Add field + setter to projectStore**

In `src/stores/projectStore.ts`:

At the top of the file, add the import:

```typescript
import type { OfficeRole } from '../lib/offices/permissionsRepository'
```

Extend `interface ProjectState`:

```typescript
  currentOfficeRole: OfficeRole | null
  setCurrentOfficeRole: (role: OfficeRole | null) => void
```

Extend the `create<ProjectState>(...)` initial state object:

```typescript
  currentOfficeRole: null,
  setCurrentOfficeRole: (role) => set({ currentOfficeRole: role }),
```

- [ ] **Step 2: Wire ProjectShell to populate it**

In `src/components/editor/ProjectShell.tsx`:

Add imports near the existing `loadOffice` import:

```typescript
import { currentUserOfficeRole } from '../../lib/offices/currentUserOfficeRole'
```

Inside the `load()` async function, after the `useInsightsStore.getState().setCurrentProjectId(office.id)` call and before `setShellState('ready')`, add:

```typescript
      // Populate the current user's role for this office so `useCanEdit`
      // can gate mutating UI. We fire-and-forget — the fallback is "edit
      // allowed" while the fetch is in flight so we don't flash a
      // read-only UI during the brief Supabase round-trip.
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (uid) {
        const role = await currentUserOfficeRole(office.id, uid)
        if (!cancelled) useProjectStore.getState().setCurrentOfficeRole(role)
      } else {
        useProjectStore.getState().setCurrentOfficeRole(null)
      }
```

- [ ] **Step 3: Run build to verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/stores/projectStore.ts src/components/editor/ProjectShell.tsx
git commit -m "feat(rbac): populate projectStore.currentOfficeRole on office load"
```

---

## Task 6: `useCanEdit()` hook

**Files:**
- Create: `src/hooks/useCanEdit.ts`
- Test: `src/__tests__/useCanEdit.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/useCanEdit.test.tsx`:

```typescript
import { renderHook } from '@testing-library/react'
import { useCanEdit } from '../hooks/useCanEdit'
import { useProjectStore } from '../stores/projectStore'

beforeEach(() => {
  useProjectStore.setState({ currentOfficeRole: null })
})

describe('useCanEdit', () => {
  it('returns true when role is unknown (permissive fallback while loading)', () => {
    useProjectStore.setState({ currentOfficeRole: null })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(true)
  })

  it('returns true for owner', () => {
    useProjectStore.setState({ currentOfficeRole: 'owner' })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(true)
  })

  it('returns true for editor', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(true)
  })

  it('returns false for viewer', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' })
    const { result } = renderHook(() => useCanEdit())
    expect(result.current).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/useCanEdit.test.tsx`
Expected: FAIL with "Cannot find module '../hooks/useCanEdit'".

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useCanEdit.ts`:

```typescript
import { useProjectStore } from '../stores/projectStore'

/**
 * Returns whether the current user may mutate the active office.
 *
 * `null` role = still loading. We default permissive (true) so the UI
 * doesn't flash a read-only state on every page load; the network
 * round-trip finishes in <300ms typical and the buttons re-disable
 * without the user noticing for viewers.
 *
 * For the pilot's binary Viewer role, `owner` and `editor` can edit;
 * `viewer` cannot. Phase 5 grows this into a full action-level matrix.
 */
export function useCanEdit(): boolean {
  const role = useProjectStore((s) => s.currentOfficeRole)
  if (role === 'viewer') return false
  return true
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/useCanEdit.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCanEdit.ts src/__tests__/useCanEdit.test.tsx
git commit -m "feat(rbac): useCanEdit hook"
```

---

## Task 7: Desk-id uniqueness validation helper

**Files:**
- Create: `src/lib/elements/deskIdValidation.ts`
- Test: `src/__tests__/deskIdValidation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/deskIdValidation.test.ts`:

```typescript
import { isDeskIdAvailable } from '../lib/elements/deskIdValidation'
import type { CanvasElement } from '../types/elements'

function desk(id: string, deskId: string): CanvasElement {
  // Minimal desk fixture. Only the fields the validator reads matter.
  return {
    id,
    type: 'desk',
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1, label: 'Desk', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId,
    assignedEmployeeId: null,
    capacity: 1,
  } as CanvasElement
}

describe('isDeskIdAvailable', () => {
  it('allows a fresh id', () => {
    const els = { a: desk('a', '1'), b: desk('b', '2') }
    expect(isDeskIdAvailable('3', els, 'new')).toBe(true)
  })

  it('rejects a duplicate id on another element', () => {
    const els = { a: desk('a', '1'), b: desk('b', '2') }
    expect(isDeskIdAvailable('1', els, 'b')).toBe(false)
  })

  it('allows the same id on the same element (renaming to what it already is)', () => {
    const els = { a: desk('a', '1'), b: desk('b', '2') }
    expect(isDeskIdAvailable('1', els, 'a')).toBe(true)
  })

  it('treats empty string as unavailable', () => {
    const els = { a: desk('a', '1') }
    expect(isDeskIdAvailable('', els, 'a')).toBe(false)
  })

  it('trims whitespace before comparing', () => {
    const els = { a: desk('a', '1') }
    expect(isDeskIdAvailable('  1  ', els, 'new')).toBe(false)
  })

  it('ignores non-assignable elements', () => {
    // A chair happens to not have deskId; validator should skip it.
    const els = {
      a: desk('a', '1'),
      c: { id: 'c', type: 'chair' } as unknown as CanvasElement,
    }
    expect(isDeskIdAvailable('1', els, 'c')).toBe(false) // still rejects 'a'
    expect(isDeskIdAvailable('9', els, 'c')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/deskIdValidation.test.ts`
Expected: FAIL with "Cannot find module '../lib/elements/deskIdValidation'".

- [ ] **Step 3: Implement the helper**

Create `src/lib/elements/deskIdValidation.ts`:

```typescript
import type { CanvasElement } from '../../types/elements'
import { isAssignableElement } from '../../types/elements'

/**
 * Returns true when `candidate` is a valid deskId to save on the
 * element identified by `selfElementId`, given the current element map.
 *
 * Rules:
 *  - empty/whitespace-only → false
 *  - duplicate of another assignable element's deskId (case-sensitive,
 *    whitespace-trimmed) → false
 *  - identical to the element's own current deskId → true (renaming to
 *    the same value is always OK)
 *
 * Non-assignable elements are ignored — the uniqueness constraint is
 * scoped to things a person can be assigned to.
 */
export function isDeskIdAvailable(
  candidate: string,
  floorElements: Record<string, CanvasElement>,
  selfElementId: string,
): boolean {
  const trimmed = candidate.trim()
  if (trimmed.length === 0) return false
  for (const el of Object.values(floorElements)) {
    if (el.id === selfElementId) continue
    if (!isAssignableElement(el)) continue
    if (el.deskId.trim() === trimmed) return false
  }
  return true
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/deskIdValidation.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/elements/deskIdValidation.ts src/__tests__/deskIdValidation.test.ts
git commit -m "feat(elements): desk-id uniqueness validator"
```

---

## Task 8: Wire uniqueness validation into PropertiesPanel + add canEdit gating

**Files:**
- Modify: `src/components/editor/RightSidebar/PropertiesPanel.tsx`
- Test: `src/__tests__/deskRenameUniqueness.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/deskRenameUniqueness.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { PropertiesPanel } from '../components/editor/RightSidebar/PropertiesPanel'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { nanoid } from 'nanoid'

function makeDesk(deskId: string) {
  return {
    id: nanoid(),
    type: 'desk' as const,
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1, label: 'Desk', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId,
    assignedEmployeeId: null,
    capacity: 1,
  }
}

beforeEach(() => {
  const a = makeDesk('1')
  const b = makeDesk('2')
  useElementsStore.setState({
    elements: { [a.id]: a, [b.id]: b },
    selectedIds: [b.id],
  } as never)
  useProjectStore.setState({ currentOfficeRole: 'editor' })
})

describe('desk rename uniqueness', () => {
  it('shows an inline error when the id collides with another desk', () => {
    render(<PropertiesPanel />)
    const input = screen.getByLabelText(/Desk ID/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '1' } })
    expect(screen.getByText(/already in use/i)).toBeInTheDocument()
  })

  it('does not persist the change while the id is invalid', () => {
    render(<PropertiesPanel />)
    const snapshot = { ...useElementsStore.getState().elements }
    const input = screen.getByLabelText(/Desk ID/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '1' } })
    const after = useElementsStore.getState().elements
    // The offending element's deskId must still be '2' in the store.
    const selectedId = useElementsStore.getState().selectedIds[0]
    expect((after[selectedId] as { deskId: string }).deskId).toBe(
      (snapshot[selectedId] as { deskId: string }).deskId,
    )
  })

  it('clears the error and saves when the user types a unique id', () => {
    render(<PropertiesPanel />)
    const input = screen.getByLabelText(/Desk ID/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '1' } })
    fireEvent.change(input, { target: { value: '99' } })
    expect(screen.queryByText(/already in use/i)).not.toBeInTheDocument()
    const selectedId = useElementsStore.getState().selectedIds[0]
    expect(
      (useElementsStore.getState().elements[selectedId] as { deskId: string }).deskId,
    ).toBe('99')
  })

  it('disables the input for viewers', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' })
    render(<PropertiesPanel />)
    const input = screen.getByLabelText(/Desk ID/i) as HTMLInputElement
    expect(input).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/deskRenameUniqueness.test.tsx`
Expected: FAIL — inline error not found; store written through.

- [ ] **Step 3: Modify PropertiesPanel to validate + gate**

In `src/components/editor/RightSidebar/PropertiesPanel.tsx`:

Add imports at the top:

```typescript
import { useState } from 'react'
import { isDeskIdAvailable } from '../../../lib/elements/deskIdValidation'
import { useCanEdit } from '../../../hooks/useCanEdit'
```

Inside the component body (near the top, after `const el = ...`), add:

```typescript
  const canEdit = useCanEdit()
  const floorElements = useElementsStore((s) => s.elements)
  const [deskIdError, setDeskIdError] = useState<string | null>(null)
```

Replace the three desk-id `<input>` blocks (for `isDeskElement`, `isWorkstationElement`, `isPrivateOfficeElement`) with this pattern — the same block for each, only the element-type cast in the `update` call differs. Shown here for the desk case; repeat identically for workstation and private-office with their respective `Partial<WorkstationElement>` / `Partial<PrivateOfficeElement>` casts:

```typescript
          <div>
            <label
              htmlFor={`deskid-${el.id}`}
              className="text-xs font-medium text-gray-500 mb-1 block"
            >
              Desk ID
            </label>
            <input
              id={`deskid-${el.id}`}
              className={`w-full text-sm border rounded px-2 py-1.5 focus:outline-none ${
                deskIdError
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-gray-200 focus:border-blue-400'
              }`}
              value={el.deskId}
              disabled={!canEdit}
              onChange={(e) => {
                const next = e.target.value
                if (isDeskIdAvailable(next, floorElements, el.id)) {
                  setDeskIdError(null)
                  update({ deskId: next } as Partial<DeskElement>)
                } else {
                  setDeskIdError(
                    next.trim().length === 0
                      ? 'Desk ID cannot be empty'
                      : `Desk ID "${next}" is already in use on this floor`,
                  )
                }
              }}
              aria-invalid={deskIdError ? 'true' : 'false'}
              aria-describedby={deskIdError ? `deskid-err-${el.id}` : undefined}
            />
            {deskIdError && (
              <div
                id={`deskid-err-${el.id}`}
                className="text-xs text-red-600 mt-1"
                role="alert"
              >
                {deskIdError}
              </div>
            )}
          </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/deskRenameUniqueness.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/RightSidebar/PropertiesPanel.tsx src/__tests__/deskRenameUniqueness.test.tsx
git commit -m "feat(properties): desk-id uniqueness validation + viewer gating"
```

---

## Task 9: FloorSwitcher — ConfirmDialog with assigned-employee count + viewer gating

**Files:**
- Modify: `src/components/editor/FloorSwitcher.tsx`
- Test: `src/__tests__/floorDeleteConfirm.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/floorDeleteConfirm.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { FloorSwitcher } from '../components/editor/FloorSwitcher'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useProjectStore } from '../stores/projectStore'
import { nanoid } from 'nanoid'

function deskEl(id: string) {
  return {
    id, type: 'desk' as const,
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1, label: 'Desk', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: '1', assignedEmployeeId: 'emp-1', capacity: 1,
  }
}

beforeEach(() => {
  const d = deskEl(nanoid())
  useFloorStore.setState({
    floors: [
      { id: 'f1', name: 'Floor 1', elements: {} },
      { id: 'f2', name: 'Floor 2', elements: { [d.id]: d } },
    ],
    activeFloorId: 'f1',
  } as never)
  useElementsStore.setState({ elements: {}, selectedIds: [] } as never)
  useEmployeeStore.setState({
    employees: {
      'emp-1': {
        id: 'emp-1', name: 'Jane', department: 'Eng', status: 'active',
        seatId: d.id, floorId: 'f2',
      } as never,
    },
  } as never)
  useProjectStore.setState({ currentOfficeRole: 'editor' })
})

describe('FloorSwitcher delete confirmation', () => {
  it('opens a ConfirmDialog (not window.confirm) with the assigned employee count', () => {
    render(<FloorSwitcher />)
    // Simulate context-menu delete via the component's own flow. Tests
    // for the exact invocation path are covered by existing floor tests;
    // here we just assert the dialog surface.
    const spy = vi.spyOn(window, 'confirm')
    fireEvent.contextMenu(screen.getByText('Floor 2'))
    fireEvent.click(screen.getByText(/Delete floor/i))
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/1 assigned employee/i)).toBeInTheDocument()
  })

  it('cancel does not delete the floor', () => {
    render(<FloorSwitcher />)
    fireEvent.contextMenu(screen.getByText('Floor 2'))
    fireEvent.click(screen.getByText(/Delete floor/i))
    fireEvent.click(screen.getByText('Cancel'))
    expect(useFloorStore.getState().floors).toHaveLength(2)
  })

  it('viewer cannot open the delete dialog at all', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' })
    render(<FloorSwitcher />)
    fireEvent.contextMenu(screen.getByText('Floor 2'))
    expect(screen.queryByText(/Delete floor/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/floorDeleteConfirm.test.tsx`
Expected: FAIL — `window.confirm` still called / dialog not found.

- [ ] **Step 3: Modify FloorSwitcher**

In `src/components/editor/FloorSwitcher.tsx`:

Add imports at the top:

```typescript
import { ConfirmDialog } from './ConfirmDialog'
import { useCanEdit } from '../../hooks/useCanEdit'
import { useEmployeeStore } from '../../stores/employeeStore'
```

Inside the component body, near the top:

```typescript
  const canEdit = useCanEdit()
  const employees = useEmployeeStore((s) => s.employees)
  const [pendingDeleteFloorId, setPendingDeleteFloorId] = useState<string | null>(null)
```

Replace the `handleDelete` body:

```typescript
  const handleDelete = (floorId: string) => {
    setContextMenuFloorId(null)
    if (floors.length <= 1) return
    setPendingDeleteFloorId(floorId)
  }

  const confirmDelete = () => {
    if (!pendingDeleteFloorId) return
    deleteFloor(pendingDeleteFloorId)
    setPendingDeleteFloorId(null)
  }

  const pendingFloor = pendingDeleteFloorId
    ? floors.find((f) => f.id === pendingDeleteFloorId) ?? null
    : null
  const pendingAssignedCount = pendingDeleteFloorId
    ? Object.values(employees).filter((e) => e.floorId === pendingDeleteFloorId).length
    : 0
```

Inside the JSX returned by the component, add the dialog below the floor-tab `<div>`s (just before the final closing `</div>` of the root):

```typescript
      {pendingFloor && (
        <ConfirmDialog
          title={`Delete ${pendingFloor.name}?`}
          tone="danger"
          confirmLabel="Delete floor"
          body={
            <div className="space-y-2">
              <p>
                This will permanently delete <strong>{pendingFloor.name}</strong>
                {Object.keys(
                  pendingFloor.id === activeFloorId
                    ? elements
                    : getFloorElements(pendingFloor.id),
                ).length > 0 && ' and all its elements'}
                .
              </p>
              {pendingAssignedCount > 0 && (
                <p>
                  <strong>
                    {pendingAssignedCount} assigned{' '}
                    {pendingAssignedCount === 1 ? 'employee' : 'employees'}
                  </strong>{' '}
                  will be unassigned. Seat history is not recoverable.
                </p>
              )}
            </div>
          }
          onConfirm={confirmDelete}
          onCancel={() => setPendingDeleteFloorId(null)}
        />
      )}
```

Replace the context-menu "Delete floor" item with a conditional render gated on `canEdit` (search for the existing "Delete" menu item and wrap it):

```typescript
              {canEdit && (
                <button
                  onClick={() => handleDelete(floor.id)}
                  className="block w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete floor
                </button>
              )}
```

Also gate "Add floor" and "Rename floor" behind `canEdit` identically (existing buttons — wrap them with `{canEdit && (...)}`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/floorDeleteConfirm.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Run full test suite to catch regressions**

Run: `npx vitest run`
Expected: All green.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/FloorSwitcher.tsx src/__tests__/floorDeleteConfirm.test.tsx
git commit -m "feat(floor): ConfirmDialog with assigned-count + viewer gating"
```

---

## Task 10: TeamSettingsMembers — ConfirmDialog

**Files:**
- Modify: `src/components/team/TeamSettingsMembers.tsx`
- Test: `src/__tests__/teamMemberRemoveConfirm.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/teamMemberRemoveConfirm.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamSettingsMembers } from '../components/team/TeamSettingsMembers'

vi.mock('../lib/teams/teamRepository', () => ({
  listTeamMembers: vi.fn(async () => [
    { team_id: 't1', user_id: 'u1', role: 'admin', joined_at: '', email: 'me@x' },
    { team_id: 't1', user_id: 'u2', role: 'member', joined_at: '', email: 'other@x' },
  ]),
  listInvites: vi.fn(async () => []),
  createInvite: vi.fn(async () => undefined),
  removeMember: vi.fn(async () => undefined),
  updateMemberRole: vi.fn(async () => undefined),
}))

vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1' } }),
}))

describe('TeamSettingsMembers remove confirm', () => {
  it('opens a ConfirmDialog (not native confirm) naming the member', async () => {
    const team = { id: 't1', slug: 'x', name: 'X', created_by: 'u1', created_at: '' }
    const spy = vi.spyOn(window, 'confirm')
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    // Wait a tick for the async listMembers
    await screen.findByText('other@x')
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/other@x/)).toBeInTheDocument()
  })
})
```

> Note: the mocked module is `src/lib/teams/teamRepository.ts`. Check that file exists before running — if the project renamed it, update the mock path here to match the actual import path at the top of `TeamSettingsMembers.tsx`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/teamMemberRemoveConfirm.test.tsx`
Expected: FAIL — dialog not found (component still uses native confirm).

- [ ] **Step 3: Modify TeamSettingsMembers**

In `src/components/team/TeamSettingsMembers.tsx`:

Add imports:

```typescript
import { useState } from 'react'
import { ConfirmDialog } from '../editor/ConfirmDialog'
```

Near the top of the component body:

```typescript
  const [pendingRemove, setPendingRemove] = useState<{ userId: string; email: string } | null>(null)
```

Replace the existing `onClick={async () => { if (confirm(...)) { ... } }}` remove-button handler with:

```typescript
                      onClick={() => setPendingRemove({ userId: m.user_id, email: m.email ?? m.user_id })}
```

Add the dialog at the end of the component's returned JSX (before the closing root tag):

```typescript
      {pendingRemove && (
        <ConfirmDialog
          title="Remove team member?"
          tone="danger"
          confirmLabel="Remove"
          body={
            <p>
              <strong>{pendingRemove.email}</strong> will lose access to this team
              and all of its offices. This cannot be undone.
            </p>
          }
          onConfirm={async () => {
            await removeMember(team.id, pendingRemove.userId)
            setPendingRemove(null)
            refresh()
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/teamMemberRemoveConfirm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/team/TeamSettingsMembers.tsx src/__tests__/teamMemberRemoveConfirm.test.tsx
git commit -m "feat(team): ConfirmDialog for member removal"
```

---

## Task 11: Undo-with-data-loss toast (hook + wire-up)

**Files:**
- Create: `src/hooks/useUndoDataLossToast.ts`
- Modify: `src/components/editor/ProjectShell.tsx`
- Test: `src/__tests__/undoDataLossToast.test.tsx`

**Why:** `src/stores/elementsStore.ts:225-249` `partialize` strips `assignedEmployeeId` / `assignedEmployeeIds` from zundo history so undo doesn't desync element state with employee.seatId. Side-effect: undoing a delete "restores" the desk but not the assignment. HR user has no idea this happened. Emit a toast.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/undoDataLossToast.test.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useUndoDataLossToast } from '../hooks/useUndoDataLossToast'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useToastStore } from '../stores/toastStore'
import { deleteElements } from '../lib/seatAssignment'
import { nanoid } from 'nanoid'

function deskEl(id: string, deskId: string, assignedTo: string | null = null) {
  return {
    id, type: 'desk' as const,
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1, label: 'Desk', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId, assignedEmployeeId: assignedTo, capacity: 1,
  }
}

beforeEach(() => {
  useToastStore.setState({ items: [] })
  const deskId = nanoid()
  useElementsStore.setState({
    elements: { [deskId]: deskEl(deskId, '1', 'emp-1') },
    selectedIds: [deskId],
  } as never)
  useEmployeeStore.setState({
    employees: {
      'emp-1': { id: 'emp-1', name: 'Jane Doe', department: 'Eng',
        status: 'active', seatId: deskId, floorId: 'f1' } as never,
    },
  } as never)
})

describe('useUndoDataLossToast', () => {
  it('fires a warning toast when undo restores a desk whose assignment was lost', () => {
    renderHook(() => useUndoDataLossToast())
    const deskEntry = Object.entries(useElementsStore.getState().elements)[0]
    const [deskStoreId] = deskEntry
    act(() => {
      deleteElements([deskStoreId])
    })
    // At this point the desk is gone and the employee is unassigned.
    act(() => {
      useElementsStore.temporal.getState().undo()
    })
    const items = useToastStore.getState().items
    expect(items.length).toBeGreaterThan(0)
    expect(items[items.length - 1].title).toMatch(/assignment not recovered/i)
    expect(items[items.length - 1].body).toMatch(/Jane Doe/)
  })

  it('does not fire when an unassigned element is restored', () => {
    const id = nanoid()
    useElementsStore.setState({
      elements: { [id]: deskEl(id, '2', null) },
      selectedIds: [id],
    } as never)
    renderHook(() => useUndoDataLossToast())
    act(() => {
      deleteElements([id])
    })
    act(() => {
      useElementsStore.temporal.getState().undo()
    })
    expect(useToastStore.getState().items).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/undoDataLossToast.test.tsx`
Expected: FAIL — hook does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useUndoDataLossToast.ts`:

```typescript
import { useEffect, useRef } from 'react'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useToastStore } from '../stores/toastStore'
import { isAssignableElement } from '../types/elements'

/**
 * Watches the elements store for undo-driven restorations. When zundo
 * brings back an assignable element whose assignment was stripped by
 * `partialize` (see `elementsStore.ts:225-249`), we emit a warning toast
 * so the HR user isn't silently left with a desk whose previous
 * occupant is now unassigned.
 *
 * Detection strategy: compare the set of element ids across store ticks.
 * For any id that appears in `next.elements` but not `prev.elements`, if
 * it is assignable and has no assignment AND the employee store still
 * remembers someone whose `seatId` was this id before, that's a lost
 * assignment.
 *
 * The employee store isn't zundo-wrapped, so `seatId` gets nulled
 * through `deleteElements()` cascades at delete time. We therefore must
 * key the detection off the element's *previous* incarnation: that
 * information lives in zundo's `pastStates`.
 *
 * Simpler: track the last-known `assignedEmployeeId` per element id in
 * a ref, and on element reappearance look up that ref. This avoids
 * deep-diffing zundo state and is deterministic under StrictMode.
 */
export function useUndoDataLossToast(): void {
  const lastAssignmentRef = useRef<Map<string, { employeeId: string; employeeName: string }>>(new Map())

  useEffect(() => {
    const unsub = useElementsStore.subscribe((state, prev) => {
      // Track assignments on every change so we have a snapshot to
      // consult when an id reappears.
      for (const el of Object.values(state.elements)) {
        if (!isAssignableElement(el)) continue
        const single = (el as { assignedEmployeeId?: string | null }).assignedEmployeeId
        if (single) {
          const name = useEmployeeStore.getState().employees[single]?.name ?? 'Someone'
          lastAssignmentRef.current.set(el.id, { employeeId: single, employeeName: name })
        }
      }

      // Find restored ids: present now, absent in prev.
      const prevIds = new Set(Object.keys(prev.elements))
      for (const [id, el] of Object.entries(state.elements)) {
        if (prevIds.has(id)) continue
        if (!isAssignableElement(el)) continue
        const single = (el as { assignedEmployeeId?: string | null }).assignedEmployeeId
        if (single) continue // still has an assignment, nothing lost
        const lost = lastAssignmentRef.current.get(id)
        if (!lost) continue
        useToastStore.getState().push({
          tone: 'warning',
          title: 'Desk restored — assignment not recovered',
          body: `${lost.employeeName}'s seat was lost when this desk was deleted. Reassign from the roster.`,
        })
        // One toast per restoration event.
        lastAssignmentRef.current.delete(id)
      }
    })
    return unsub
  }, [])
}
```

- [ ] **Step 4: Wire into ProjectShell**

In `src/components/editor/ProjectShell.tsx`:

Add import:

```typescript
import { useUndoDataLossToast } from '../../hooks/useUndoDataLossToast'
```

Call the hook alongside the existing `useKeyboardShortcuts()`:

```typescript
  useKeyboardShortcuts()
  useUndoDataLossToast()
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/undoDataLossToast.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useUndoDataLossToast.ts src/components/editor/ProjectShell.tsx src/__tests__/undoDataLossToast.test.tsx
git commit -m "feat(undo): warning toast when restored desk loses its assignment"
```

---

## Task 12: Gate remaining map-editing surfaces with `useCanEdit`

**Files:**
- Modify: `src/components/editor/LeftSidebar/ElementLibrary.tsx`
- Modify: `src/components/editor/Canvas/CanvasStage.tsx`

**Why:** With the hook in place, the remaining surfaces that mutate map state need to honor it. Properties inputs are already gated (Task 8); floor controls are already gated (Task 9). These are the last two.

- [ ] **Step 1: Gate ElementLibrary**

In `src/components/editor/LeftSidebar/ElementLibrary.tsx`:

Add import:

```typescript
import { useCanEdit } from '../../../hooks/useCanEdit'
```

In the component body, read the hook:

```typescript
  const canEdit = useCanEdit()
```

On each library tile (both the top-level groups and the individual element buttons), add:

```typescript
            disabled={!canEdit}
            draggable={canEdit}
            title={!canEdit ? 'Read-only access. Contact an editor to make changes.' : undefined}
```

…and replace the existing click handler with an early-return:

```typescript
            onClick={() => {
              if (!canEdit) return
              // …existing click body unchanged…
            }}
```

- [ ] **Step 2: Gate CanvasStage editing handlers**

In `src/components/editor/Canvas/CanvasStage.tsx`:

Add import near the existing hook imports:

```typescript
import { useCanEdit } from '../../../hooks/useCanEdit'
```

In the component body:

```typescript
  const canEdit = useCanEdit()
```

Add an early-return guard at the top of each of these handlers (search by name and prepend `if (!canEdit) return` as the first statement inside the handler body):

- `onDrop` (library-tile drop)
- `onDragOver` — gate the `e.preventDefault()` so the drop doesn't visually accept
- `handleKeyDown` — only when the key is `Backspace` / `Delete`; other keys (zoom, pan) stay permitted
- `handleTransformEnd`
- `handleDragEnd`
- `handleClick` on elements — viewers may still `select` but not open drag. Keep `setSelectedIds` working; block everything downstream. Document with a one-line comment: `// Selection is allowed for viewers (non-mutating); drag/transform handlers bail out above.`

- [ ] **Step 3: Run build + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All green.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/LeftSidebar/ElementLibrary.tsx src/components/editor/Canvas/CanvasStage.tsx
git commit -m "feat(rbac): gate ElementLibrary + CanvasStage editing on useCanEdit"
```

---

## Task 13: Gate remaining roster-editing surfaces with `useCanEdit`

**Files:**
- Modify: `src/components/editor/RosterPage.tsx`
- Modify: `src/components/editor/RosterDetailDrawer.tsx`
- Modify: `src/components/editor/PeoplePanel.tsx`

- [ ] **Step 1: Gate RosterPage**

In `src/components/editor/RosterPage.tsx`:

Add import:

```typescript
import { useCanEdit } from '../../hooks/useCanEdit'
```

Near the top of the component body:

```typescript
  const canEdit = useCanEdit()
```

Wrap every place the roster mutates — these are the call sites to gate:

- The bulk-action bar (`Delete`, `Unassign`, `Clear`): render conditional on `canEdit`, e.g. `{canEdit && <BulkBar ... />}`.
- The "+ Add", "Import", "Export CSV" buttons in the filters bar (wrap each in `{canEdit && (...)}` — export *stays* available to viewers; only wrap Add + Import).
- Inline-editable cells (Name, Dept, Title, Status): wrap the cell renderer. When `!canEdit`, render plain text; when `canEdit`, render the existing editable cell.
- Row-action `⋯` menu: gate `Edit full details`, `Unassign`, `Delete` items behind `canEdit`. Viewers see the menu button but only with view-only entries (just "Open in map"). If that leaves the menu empty, hide the `⋯` button entirely.
- Checkbox for bulk selection: hide for viewers (their only destructive action would be bulk-delete/unassign which is gated).

- [ ] **Step 2: Gate RosterDetailDrawer**

In `src/components/editor/RosterDetailDrawer.tsx`:

Add import + hook call:

```typescript
import { useCanEdit } from '../../hooks/useCanEdit'
```

```typescript
  const canEdit = useCanEdit()
```

Every input, select, textarea, combobox, and date picker in the drawer: add `disabled={!canEdit}`. Action buttons (Unassign, Delete) at the drawer footer: render conditional on `canEdit`.

- [ ] **Step 3: Gate PeoplePanel drag source**

In `src/components/editor/PeoplePanel.tsx`:

Add import + hook call:

```typescript
import { useCanEdit } from '../../hooks/useCanEdit'
```

```typescript
  const canEdit = useCanEdit()
```

On the draggable employee row, set:

```typescript
  draggable={canEdit}
  title={!canEdit ? 'Read-only access. Contact an editor to make changes.' : undefined}
```

- [ ] **Step 4: Write integration test for role gating**

Create `src/__tests__/viewerRoleGating.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RosterPage } from '../components/editor/RosterPage'
import { useProjectStore } from '../stores/projectStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'

beforeEach(() => {
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useEmployeeStore.setState({
    employees: {
      'e1': {
        id: 'e1', name: 'Jane', department: 'Eng', status: 'active',
        seatId: null, floorId: null,
      } as never,
    },
    departmentColors: {},
  } as never)
})

describe('Roster viewer gating', () => {
  it('admin sees Add button', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' })
    render(<MemoryRouter><RosterPage /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /\+ Add/i })).toBeInTheDocument()
  })

  it('viewer does not see Add button', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' })
    render(<MemoryRouter><RosterPage /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /\+ Add/i })).not.toBeInTheDocument()
  })

  it('viewer does not see inline-editable Name input', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' })
    render(<MemoryRouter><RosterPage /></MemoryRouter>)
    // Viewer sees plain text, not an input.
    expect(screen.queryByDisplayValue('Jane')).not.toBeInTheDocument()
    expect(screen.getByText('Jane')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/__tests__/viewerRoleGating.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All green.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/RosterPage.tsx src/components/editor/RosterDetailDrawer.tsx src/components/editor/PeoplePanel.tsx src/__tests__/viewerRoleGating.test.tsx
git commit -m "feat(rbac): gate roster editing surfaces on useCanEdit"
```

---

## Task 14: Final verification + PR

- [ ] **Step 1: Run tsc + vitest + build**

Run:
```bash
npx tsc --noEmit && npx vitest run && npm run build
```
Expected: all clean, no bundle-size regression >10kb gzipped on the editor chunk.

- [ ] **Step 2: Manual smoke test**

Launch dev server and verify each item:

1. Delete a floor containing elements — dialog shows assigned employee count; Cancel preserves.
2. Remove a team member — dialog names the member; Cancel preserves.
3. Rename a desk to match another desk's id — inline error appears; input turns red; change is not persisted.
4. Delete a desk with an assignment, then Cmd+Z — toast appears: "Desk restored — assignment not recovered. {Name}'s seat was lost…"
5. Manually set `projectStore.currentOfficeRole = 'viewer'` via devtools — verify all editing UI disables across Map, Roster, FloorSwitcher, PeoplePanel.
6. Restore to `'editor'` — verify editing re-enables.

- [ ] **Step 3: Push and open PR**

Run:
```bash
git push -u origin feat/phase1-safety-and-viewer-role
gh pr create --title "Phase 1: safety papercuts + viewer role" --body "$(cat <<'EOF'
## Summary
- Floor-delete + team-member-remove confirms adopt ConfirmDialog; floor delete shows assigned employee count.
- Desk-rename uniqueness validated per floor with inline error.
- Undo warning toast when zundo restores a desk that loses its prior assignment.
- Minimal toast system introduced (`toastStore` + `Toaster`) for this and future phases.
- Enforces the existing per-office `OfficeRole` (`owner | editor | viewer`) across the editor, roster, and map surfaces via a new `useCanEdit()` hook — previously only `ShareModal` consumed it.

Implements Phase 1 of `docs/superpowers/specs/2026-04-23-pilot-readiness-roadmap-design.md`.

## Test plan
- [ ] tsc --noEmit clean
- [ ] vitest all tests pass
- [ ] Manual: floor delete dialog shows count
- [ ] Manual: team member remove dialog names the member
- [ ] Manual: desk rename duplicate shows inline error
- [ ] Manual: undo a deleted-assigned-desk fires warning toast
- [ ] Manual: viewer role disables all editing across map + roster

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Out-of-scope (deferred to later phases)

Explicitly **not** in Phase 1:
- Full four-role RBAC (`HR Editor` / `Space Planner` split) — Phase 5.
- Server-side RLS enforcement of roles — Phase 5 (currently client-side only; Phase 5 adds Supabase RLS policies).
- Audit logging of who edited what — Phase 5.
- CSV import summary modal — Phase 2.
- Bulk roster edits — Phase 3.
- Leave metadata — Phase 4.

If any of the above appear to be needed mid-implementation, stop and escalate — they need their own spec pass, not scope creep into this phase.
