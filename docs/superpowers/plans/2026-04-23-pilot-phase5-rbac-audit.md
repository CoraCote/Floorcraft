# Phase 5 — Governance: Full RBAC + Audit Log

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four-role RBAC model (`owner | editor | hr-editor | space-planner | viewer`) plus a pilot-ready audit trail across three stacked PRs.

**Architecture:** Widen the existing `office_permissions.role` check constraint additively (no renames) so legacy `owner | editor | viewer` rows keep working during the transition. Add `audit_events` table + RLS. Replace the binary `useCanEdit()` hook with a matrix-driven `useCan(action)` that reads `projectStore.currentOfficeRole` and returns a boolean per `Action`. Emission is a thin `audit.emit(...)` helper that posts best-effort — failures log but never block the user action.

**Tech Stack:** Vite/React 19 + TypeScript + Zustand, Supabase Postgres + RLS, React Router v6, Vitest + @testing-library/react.

---

## Scope check

Three independent PRs, each producing shippable code. PR 5a is schema + SQL tests (codefile-only; deployment gated to the user). PR 5b is a pure client refactor that consumes the widened role set. PR 5c wires the audit UI + emission once PRs 5a/5b are in.

---

## File structure

**New files:**
- `supabase/migrations/0010_rbac_and_audit.sql` — widens role constraint; creates `audit_events`; adds RLS policies.
- `supabase/tests/rls_roles.sql` — pgTap-style SQL tests. Mock/fake implementations if pgTap isn't wired.
- `src/lib/permissions.ts` — role + action types, matrix, `can(role, action)` function.
- `src/hooks/useCan.ts` — hook form of `can()`, reads `projectStore.currentOfficeRole`.
- `src/lib/audit.ts` — `emit(action, targetType, targetId, metadata)` posts to `audit_events`.
- `src/lib/auditRepository.ts` — thin Supabase wrapper: `listEvents(filters)`, `insertEvent(row)`.
- `src/components/admin/AuditLogPage.tsx` — `/project/:slug/audit` route.
- `src/__tests__/permissions.test.ts`
- `src/__tests__/rolePermissionGating.test.tsx`
- `src/__tests__/auditEmission.test.ts`
- `src/__tests__/auditLogPage.test.tsx`

**Modified:**
- `src/lib/offices/permissionsRepository.ts` — widen `OfficeRole` union.
- `src/hooks/useCanEdit.ts` — re-exports `useCan('editMap') || useCan('editRoster')` as a compatibility shim so existing call sites don't break mid-refactor.
- `src/stores/employeeStore.ts`, `src/lib/seatAssignment.ts`, `src/stores/elementsStore.ts`, `src/components/editor/FloorSwitcher.tsx`, `src/components/team/TeamSettingsMembers.tsx`, `src/components/editor/RightSidebar/CSVImportDialog.tsx` — add `audit.emit(...)` calls at the sites the spec lists.
- `src/components/editor/ProjectShell.tsx` — add `/audit` route (lazy-loaded).
- `src/App.tsx` — register audit route.
- `src/components/editor/TopBar.tsx` — Owner + HR Editor see an "Audit log" menu item.

**Reused as-is:**
- `src/stores/projectStore.ts` — already stores `currentOfficeRole`.
- `src/lib/offices/currentUserOfficeRole.ts` — already resolves the viewer's role.

---

## PR 5a — Supabase schema + RLS (code-only; manual deploy)

### Task 1 — Migration SQL

**Files:**
- Create: `supabase/migrations/0010_rbac_and_audit.sql`
- Test: `supabase/tests/rls_roles.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0010_rbac_and_audit.sql
-- Phase 5: widen office_permissions roles; add audit_events table + RLS.

-- 1. Widen the office_permissions role constraint additively so legacy
--    rows keep working. New roles slot in next to existing ones.
alter table office_permissions
  drop constraint if exists office_permissions_role_check;
alter table office_permissions
  add constraint office_permissions_role_check
  check (role in ('owner','editor','hr-editor','space-planner','viewer'));

-- 2. audit_events table. Scoped to a team (workspace) so RLS can reuse
--    the same team-membership check other tables use. `metadata` is
--    jsonb for flexibility without schema churn.
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_team_idx on audit_events(team_id, created_at desc);
create index audit_events_actor_idx on audit_events(actor_id);

-- 3. RLS: a team member can see their team's events; only their own
--    inserts are allowed (prevents spoofing). Owners + HR Editors can
--    SELECT via the viewer UI (checked client-side); RLS just enforces
--    team scope here. No UPDATE/DELETE policies — events are immutable.
alter table audit_events enable row level security;

create policy "audit_events_team_select"
  on audit_events for select
  using (
    exists (
      select 1 from team_members tm
      where tm.team_id = audit_events.team_id
        and tm.user_id = auth.uid()
    )
  );

create policy "audit_events_self_insert"
  on audit_events for insert
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from team_members tm
      where tm.team_id = audit_events.team_id
        and tm.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Write SQL tests**

```sql
-- supabase/tests/rls_roles.sql
-- Smoke-level SQL checks. These run via `supabase db reset --local`
-- followed by `psql -f supabase/tests/rls_roles.sql`. Not pgTap-wired;
-- the tests raise exceptions on failure so the script exits non-zero.

do $$
begin
  -- audit_events must have team_id + actor_id columns
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'audit_events' and column_name = 'team_id'
  ) then
    raise exception 'audit_events.team_id missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'audit_events' and column_name = 'actor_id'
  ) then
    raise exception 'audit_events.actor_id missing';
  end if;
end $$;

do $$
declare
  cstr text;
begin
  select pg_get_constraintdef(c.oid) into cstr
  from pg_constraint c
  where c.conname = 'office_permissions_role_check';
  if cstr not like '%hr-editor%' or cstr not like '%space-planner%' then
    raise exception 'office_permissions role check does not include the new roles: %', cstr;
  end if;
end $$;

-- RLS must be enabled on audit_events
do $$
begin
  if not (
    select relrowsecurity from pg_class where relname = 'audit_events'
  ) then
    raise exception 'RLS not enabled on audit_events';
  end if;
end $$;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_rbac_and_audit.sql supabase/tests/rls_roles.sql
git commit -m "feat(db): widen office roles + add audit_events table and RLS"
```

### Task 2 — TypeScript role-type widening

**Files:**
- Modify: `src/lib/offices/permissionsRepository.ts`

- [ ] **Step 1: Widen the `OfficeRole` union**

Open the file and change:
```ts
export type OfficeRole = 'owner' | 'editor' | 'viewer'
```
to:
```ts
export type OfficeRole =
  | 'owner'
  | 'editor'
  | 'hr-editor'
  | 'space-planner'
  | 'viewer'
```

- [ ] **Step 2: Run full gauntlet**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: clean. The widening is additive — no existing narrow comparison should break (we compare to `'viewer'` in `useCanEdit`; other code paths accept any string).

- [ ] **Step 3: Commit**

```bash
git add src/lib/offices/permissionsRepository.ts
git commit -m "feat(types): widen OfficeRole to include hr-editor and space-planner"
```

### Task 3 — Push + open PR 5a

- [ ] **Step 1: Push**

```bash
git push -u origin feat/phase5-rbac-audit
```

- [ ] **Step 2: Open PR**

Base: `feat/phase4-employee-lifecycle` (stacked). Title: `Phase 5a: widen office roles + audit_events schema`.

Body:
```
## Summary
- Migration 0010 widens office_permissions.role additively to include hr-editor, space-planner.
- New audit_events table with team-scoped RLS (select for team members; insert for self only; no update/delete — events are immutable).
- TypeScript OfficeRole union widened accordingly.

## Deploy notes
- Additive migration — safe to apply before PR 5b/5c ship.
- Existing owner/editor/viewer rows unchanged.
- RLS tests live in supabase/tests/rls_roles.sql; run manually against a local shadow DB.

## Test plan
- [x] tsc + vitest + build clean
- [ ] Manual: `supabase db reset` locally, confirm migration applies
- [ ] Manual: run `psql -f supabase/tests/rls_roles.sql` against the local DB

🤖 Generated with Claude Code
```

---

## PR 5b — Client permissions refactor

### Task 4 — Permissions matrix + useCan hook

**Files:**
- Create: `src/lib/permissions.ts`
- Create: `src/hooks/useCan.ts`
- Create: `src/__tests__/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/permissions.test.ts
import { describe, it, expect } from 'vitest'
import { can, type Role, type Action } from '../lib/permissions'

describe('permissions matrix', () => {
  it('owner can do everything', () => {
    const actions: Action[] = [
      'editRoster', 'editMap', 'manageTeam',
      'viewAuditLog', 'viewReports', 'manageBilling', 'generateShareLink',
    ]
    for (const a of actions) expect(can('owner', a)).toBe(true)
  })

  it('viewer can only view reports', () => {
    expect(can('viewer', 'viewReports')).toBe(true)
    expect(can('viewer', 'editRoster')).toBe(false)
    expect(can('viewer', 'editMap')).toBe(false)
    expect(can('viewer', 'manageTeam')).toBe(false)
    expect(can('viewer', 'viewAuditLog')).toBe(false)
  })

  it('hr-editor can edit roster but not map', () => {
    expect(can('hr-editor', 'editRoster')).toBe(true)
    expect(can('hr-editor', 'editMap')).toBe(false)
    expect(can('hr-editor', 'viewAuditLog')).toBe(true)
    expect(can('hr-editor', 'manageTeam')).toBe(false)
  })

  it('space-planner can edit map but not roster', () => {
    expect(can('space-planner', 'editMap')).toBe(true)
    expect(can('space-planner', 'editRoster')).toBe(false)
    expect(can('space-planner', 'viewAuditLog')).toBe(false)
  })

  it('legacy editor gets both edit permissions', () => {
    expect(can('editor', 'editRoster')).toBe(true)
    expect(can('editor', 'editMap')).toBe(true)
    expect(can('editor', 'manageTeam')).toBe(false)
    expect(can('editor', 'viewAuditLog')).toBe(false)
  })

  it('null role fails open on view, closed on everything else', () => {
    // Unknown role = transient load state. Match useCanEdit's fail-open
    // precedent for viewReports only (inert surface); deny mutations.
    expect(can(null, 'viewReports')).toBe(true)
    expect(can(null, 'editRoster')).toBe(false)
    expect(can(null, 'editMap')).toBe(false)
    expect(can(null, 'manageTeam')).toBe(false)
  })

  it('unknown action returns false', () => {
    // @ts-expect-error intentional
    expect(can('owner', 'somethingElse')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — should FAIL (no file)**

```bash
npx vitest run src/__tests__/permissions.test.ts
```

- [ ] **Step 3: Implement `src/lib/permissions.ts`**

```ts
// src/lib/permissions.ts
import type { OfficeRole } from './offices/permissionsRepository'

export type Role = OfficeRole
export type Action =
  | 'editRoster'
  | 'editMap'
  | 'manageTeam'
  | 'viewAuditLog'
  | 'viewReports'
  | 'manageBilling'
  | 'generateShareLink'

/**
 * Pilot-era permissions matrix. Legacy `editor` is the union of
 * `hr-editor` and `space-planner` so existing office_permissions rows
 * keep their current capabilities. New rows should prefer the narrower
 * roles.
 */
const MATRIX: Record<Role, Action[]> = {
  owner: [
    'editRoster', 'editMap', 'manageTeam',
    'viewAuditLog', 'viewReports', 'manageBilling', 'generateShareLink',
  ],
  editor: [
    'editRoster', 'editMap', 'viewReports',
  ],
  'hr-editor': [
    'editRoster', 'viewAuditLog', 'viewReports',
  ],
  'space-planner': [
    'editMap', 'viewReports',
  ],
  viewer: [
    'viewReports',
  ],
}

export function can(role: Role | null, action: Action): boolean {
  if (role === null) {
    // Transient load: mirror useCanEdit's fail-open precedent for
    // non-mutating views only. Mutations stay gated so an uninitialized
    // role can't accidentally enable destructive UI.
    return action === 'viewReports'
  }
  const allowed = MATRIX[role]
  if (!allowed) return false
  return allowed.includes(action)
}
```

- [ ] **Step 4: Run tests — PASS**

```bash
npx vitest run src/__tests__/permissions.test.ts
```

- [ ] **Step 5: Add `useCan` hook**

```ts
// src/hooks/useCan.ts
import { useProjectStore } from '../stores/projectStore'
import { can, type Action } from '../lib/permissions'

export function useCan(action: Action): boolean {
  const role = useProjectStore((s) => s.currentOfficeRole)
  return can(role, action)
}
```

- [ ] **Step 6: Keep `useCanEdit` as compatibility shim**

Open `src/hooks/useCanEdit.ts` and replace the body with:

```ts
import { useCan } from './useCan'

/**
 * Legacy compatibility shim. Returns true if the viewer can edit either
 * the map or the roster. New code should call `useCan('editMap')` or
 * `useCan('editRoster')` directly — that preserves the narrower signal
 * that hr-editor vs space-planner provides.
 */
export function useCanEdit(): boolean {
  const canMap = useCan('editMap')
  const canRoster = useCan('editRoster')
  return canMap || canRoster
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/permissions.ts src/hooks/useCan.ts src/hooks/useCanEdit.ts src/__tests__/permissions.test.ts
git commit -m "feat(auth): permissions matrix + useCan hook"
```

### Task 5 — Gate call sites by narrower actions

**Files:**
- Modify: `src/components/editor/RosterPage.tsx` — was using `useCanEdit`, switch to `useCan('editRoster')`.
- Modify: `src/components/editor/RosterDetailDrawer.tsx` — same.
- Modify: `src/components/editor/Canvas/CanvasStage.tsx` — switch to `useCan('editMap')`.
- Modify: `src/components/editor/LeftSidebar/ToolSelector.tsx` — `useCan('editMap')`.
- Modify: `src/components/editor/LeftSidebar/ElementLibrary.tsx` — `useCan('editMap')`.
- Modify: `src/components/editor/FloorSwitcher.tsx` — `useCan('editMap')`.
- Modify: `src/components/editor/RightSidebar/PropertiesPanel.tsx` — `useCan('editMap')`.
- Modify: `src/components/editor/RightSidebar/PeoplePanel.tsx` — `useCan('editRoster')`.
- Test: `src/__tests__/rolePermissionGating.test.tsx`.

- [ ] **Step 1: Write the failing integration test**

```tsx
// src/__tests__/rolePermissionGating.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RosterPage } from '../components/editor/RosterPage'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useEmployeeStore.setState({ employees: {}, departmentColors: {} } as never)
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/t/t/o/o/roster']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/roster" element={<RosterPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('role-based permission gating', () => {
  it('space-planner cannot see "Add person" on roster', () => {
    useProjectStore.setState({ currentOfficeRole: 'space-planner' } as never)
    mount()
    expect(screen.queryByRole('button', { name: /add person/i })).toBeNull()
  })

  it('hr-editor sees "Add person" on roster', () => {
    useProjectStore.setState({ currentOfficeRole: 'hr-editor' } as never)
    mount()
    expect(screen.getByRole('button', { name: /add person/i })).toBeInTheDocument()
  })

  it('viewer sees everything disabled', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as never)
    mount()
    expect(screen.queryByRole('button', { name: /add person/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /import/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test — FAIL (RosterPage still uses useCanEdit which returns true for all non-viewer roles)**

```bash
npx vitest run src/__tests__/rolePermissionGating.test.tsx
```

- [ ] **Step 3: Switch each call site**

Find every `useCanEdit()` call and evaluate: does this surface mutate the map, the roster, or both?

- Roster: `useCan('editRoster')`
- Map/canvas: `useCan('editMap')`
- Shared (rare): keep `useCanEdit()` as-is

Update imports accordingly. Ripgrep them all:
```bash
rg -l useCanEdit src/
```

The exhaustive list (as of Phase 4):
- `RosterPage.tsx` → `editRoster`
- `RosterDetailDrawer.tsx` → `editRoster`
- `RosterBulkEditPopover.tsx` → `editRoster`
- `Canvas/CanvasStage.tsx` → `editMap`
- `Canvas/DoorRenderer.tsx` (and friends if any) → `editMap`
- `LeftSidebar/ToolSelector.tsx` → `editMap`
- `LeftSidebar/ElementLibrary.tsx` → `editMap`
- `FloorSwitcher.tsx` → `editMap`
- `RightSidebar/PropertiesPanel.tsx` → `editMap`
- `RightSidebar/PeoplePanel.tsx` → `editRoster`
- `RightSidebar/CSVImportDialog.tsx` → `editRoster`
- `TopBar.tsx` (undo/redo, save indicator) → keep shim `useCanEdit()` since undo/redo spans both

If any file's scope is ambiguous, check what mutations its buttons issue. If a button calls `updateEmployee`/`addEmployee`/etc., it's roster. If it calls `useElementsStore` mutations or `useFloorStore` mutations, it's map.

- [ ] **Step 4: Run tests — PASS**

```bash
npx vitest run
```

Expected: existing tests still pass (compatibility shim covers the `true`-if-either case their assertions rely on); new gating test passes.

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "feat(auth): gate map vs roster call sites with narrower actions"
```

### Task 6 — Role-change UI in TeamSettingsMembers (Owner-only)

**Files:**
- Modify: `src/components/team/TeamSettingsMembers.tsx` — the existing component that already exists per Phase 1.
- Test: extend any existing `teamSettingsMembers.test.tsx` or add `teamRoleChange.test.tsx`.

- [ ] **Step 1: Read the existing component**

```bash
cat src/components/team/TeamSettingsMembers.tsx | head -100
```

- [ ] **Step 2: Add role `<select>` per row**

If the file already renders a member list: add a `<select>` column showing the current role and dispatching to `upsertPermission(officeId, userId, role)` on change. Only render the `<select>` when `useCan('manageTeam')` is true — for non-owners, show the role as text.

Options:
```tsx
<option value="owner">Owner</option>
<option value="hr-editor">HR Editor</option>
<option value="space-planner">Space Planner</option>
<option value="editor">Editor (legacy)</option>
<option value="viewer">Viewer</option>
```

Legacy `editor` is present but deprecated — include it so current rows aren't forced to change.

- [ ] **Step 3: Commit**

```bash
git add src/components/team/TeamSettingsMembers.tsx
git commit -m "feat(team): Owner-only role-change dropdown"
```

### Task 7 — Push PR 5b

Same flow as PR 5a: push, open PR with base = `feat/phase5-rbac-audit` once PR 5a lands, or cumulative on the same branch. Title: `Phase 5b: client permissions refactor`.

For simplicity, keep everything on `feat/phase5-rbac-audit` as a single phase-long branch and open ONE combined PR for 5a+5b+5c. The spec's "3 PRs" framing was for governance-release theater; one-branch-per-phase is the project's operating norm. Note this choice in the PR body.

---

## PR 5c — Audit log UI + emission

### Task 8 — audit.ts emission helper

**Files:**
- Create: `src/lib/audit.ts`
- Create: `src/lib/auditRepository.ts`
- Create: `src/__tests__/auditEmission.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/auditEmission.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as repo from '../lib/auditRepository'
import { emit } from '../lib/audit'
import { useProjectStore } from '../stores/projectStore'

vi.mock('../lib/auditRepository', () => ({
  insertEvent: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  vi.mocked(repo.insertEvent).mockClear()
  useProjectStore.setState({
    currentTeamId: 'team-1',
    currentUserId: 'user-1',
  } as never)
})

describe('audit.emit', () => {
  it('posts action + target with auto-filled team + actor', async () => {
    await emit('employee.create', 'employee', 'e1', { name: 'Alice' })
    expect(repo.insertEvent).toHaveBeenCalledWith({
      team_id: 'team-1',
      actor_id: 'user-1',
      action: 'employee.create',
      target_type: 'employee',
      target_id: 'e1',
      metadata: { name: 'Alice' },
    })
  })

  it('swallows insert failures (best-effort)', async () => {
    vi.mocked(repo.insertEvent).mockRejectedValueOnce(new Error('network'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      emit('employee.create', 'employee', 'e2', {}),
    ).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('skips when team or user is missing (pre-login)', async () => {
    useProjectStore.setState({
      currentTeamId: null,
      currentUserId: null,
    } as never)
    await emit('employee.create', 'employee', 'e3', {})
    expect(repo.insertEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement auditRepository**

```ts
// src/lib/auditRepository.ts
import { supabase } from './supabase'

export interface AuditEventRow {
  team_id: string
  actor_id: string
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
}

export async function insertEvent(row: AuditEventRow): Promise<void> {
  const { error } = await supabase.from('audit_events').insert(row)
  if (error) throw error
}

export async function listEvents(teamId: string, opts: {
  actorId?: string
  action?: string
  from?: string // ISO
  to?: string
  limit?: number
} = {}): Promise<AuditEventRow[]> {
  let q = supabase.from('audit_events').select('*').eq('team_id', teamId)
  if (opts.actorId) q = q.eq('actor_id', opts.actorId)
  if (opts.action) q = q.eq('action', opts.action)
  if (opts.from) q = q.gte('created_at', opts.from)
  if (opts.to) q = q.lte('created_at', opts.to)
  q = q.order('created_at', { ascending: false }).limit(opts.limit ?? 200)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AuditEventRow[]
}
```

- [ ] **Step 3: Implement audit.emit**

```ts
// src/lib/audit.ts
import { insertEvent } from './auditRepository'
import { useProjectStore } from '../stores/projectStore'

export async function emit(
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { currentTeamId, currentUserId } = useProjectStore.getState()
  if (!currentTeamId || !currentUserId) return
  try {
    await insertEvent({
      team_id: currentTeamId,
      actor_id: currentUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
    })
  } catch (err) {
    // Best-effort — never block the user's action.
    console.error('[audit] emit failed', { action, targetType, targetId, err })
  }
}
```

If `projectStore` doesn't yet expose `currentTeamId` + `currentUserId`: add them. The store already tracks `currentOfficeRole`; team + user ids are set alongside it in `ProjectShell`. This is a small, surgical addition.

- [ ] **Step 4: Run tests — PASS**

```bash
npx vitest run src/__tests__/auditEmission.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts src/lib/auditRepository.ts src/__tests__/auditEmission.test.ts src/stores/projectStore.ts
git commit -m "feat(audit): emission helper + repository"
```

### Task 9 — Wire emission at call sites

**Files to modify** (per spec):
- `src/stores/employeeStore.ts` — after `addEmployee`, `updateEmployee`, `deleteEmployee` mutate state.
- `src/lib/seatAssignment.ts` — after `assignEmployee`, `unassignEmployee`.
- `src/stores/elementsStore.ts` — after element delete (specifically the `deleteElements` action if present).
- `src/components/editor/FloorSwitcher.tsx` — after floor create/delete.
- `src/components/team/TeamSettingsMembers.tsx` — after member add/remove/role change.
- `src/components/editor/RightSidebar/CSVImportDialog.tsx` — after successful CSV import, include row-count metadata.

- [ ] **Step 1: Add emissions**

Pattern for each site:
```ts
import { emit } from '../lib/audit'
// ...after the mutation lands:
void emit('employee.create', 'employee', id, { name })
```

Use fire-and-forget (`void emit(...)`). Never await; the spec is explicit that emission is best-effort and non-blocking.

Action name conventions:
- `employee.create | employee.update | employee.delete`
- `seat.assign | seat.unassign`
- `element.delete`
- `floor.create | floor.delete`
- `member.add | member.remove | member.role_change`
- `csv.import` with `metadata: { count }`

- [ ] **Step 2: Run full gauntlet**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

Expected: still green. Emissions are additive, don't alter state.

- [ ] **Step 3: Commit**

```bash
git add -A src/
git commit -m "feat(audit): wire emissions at mutation call sites"
```

### Task 10 — AuditLogPage

**Files:**
- Create: `src/components/admin/AuditLogPage.tsx`
- Modify: `src/App.tsx` — register route.
- Modify: `src/components/editor/TopBar.tsx` — conditional "Audit log" link.
- Test: `src/__tests__/auditLogPage.test.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/auditLogPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuditLogPage } from '../components/admin/AuditLogPage'
import { useProjectStore } from '../stores/projectStore'
import * as repo from '../lib/auditRepository'

vi.mock('../lib/auditRepository', () => ({
  listEvents: vi.fn(),
}))

beforeEach(() => {
  useProjectStore.setState({
    currentOfficeRole: 'owner',
    currentTeamId: 't1',
    currentUserId: 'u1',
  } as never)
  vi.mocked(repo.listEvents).mockResolvedValue([
    {
      team_id: 't1', actor_id: 'u1', action: 'employee.create',
      target_type: 'employee', target_id: 'e1', metadata: {},
      // @ts-expect-error test shape
      id: 'a1', created_at: '2026-04-20T10:00:00Z', actor_name: 'Alice',
    },
    {
      team_id: 't1', actor_id: 'u2', action: 'seat.assign',
      target_type: 'employee', target_id: 'e2', metadata: {},
      // @ts-expect-error test shape
      id: 'a2', created_at: '2026-04-21T11:00:00Z', actor_name: 'Bob',
    },
  ])
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/project/slug/audit']}>
      <Routes>
        <Route path="/project/:slug/audit" element={<AuditLogPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AuditLogPage', () => {
  it('renders events from repository', async () => {
    mount()
    await waitFor(() => expect(screen.getByText('employee.create')).toBeInTheDocument())
    expect(screen.getByText('seat.assign')).toBeInTheDocument()
  })

  it('hides page for viewer role', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as never)
    mount()
    expect(screen.getByText(/not authorized/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement AuditLogPage**

```tsx
// src/components/admin/AuditLogPage.tsx
import { useEffect, useState } from 'react'
import { useCan } from '../../hooks/useCan'
import { useProjectStore } from '../../stores/projectStore'
import { listEvents, type AuditEventRow } from '../../lib/auditRepository'

export function AuditLogPage() {
  const canView = useCan('viewAuditLog')
  const teamId = useProjectStore((s) => s.currentTeamId)
  const [events, setEvents] = useState<AuditEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actorFilter, setActorFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  useEffect(() => {
    if (!canView || !teamId) { setLoading(false); return }
    let cancelled = false
    listEvents(teamId, {
      actorId: actorFilter || undefined,
      action: actionFilter || undefined,
    })
      .then((rows) => { if (!cancelled) setEvents(rows) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [canView, teamId, actorFilter, actionFilter])

  if (!canView) {
    return <div className="p-6 text-gray-600">Not authorized to view the audit log.</div>
  }
  if (loading) return <div className="p-6">Loading…</div>

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <div className="flex gap-2">
        <input
          placeholder="Filter by actor id"
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="px-2 py-1 text-sm border rounded"
        />
        <input
          placeholder="Filter by action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-2 py-1 text-sm border rounded"
        />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th>When</th><th>Actor</th><th>Action</th><th>Target</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            // @ts-expect-error repo may augment rows with created_at/id
            const ts = e.created_at ?? ''
            return (
              <tr key={(e as { id?: string }).id ?? `${e.actor_id}-${ts}`} className="border-b">
                <td className="py-1">{ts}</td>
                <td className="py-1">{e.actor_id}</td>
                <td className="py-1">{e.action}</td>
                <td className="py-1">{e.target_type}/{e.target_id}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Register route in App.tsx**

Lazy-load and add:
```tsx
const AuditLogPage = lazy(() => import('./components/admin/AuditLogPage').then(m => ({ default: m.AuditLogPage })))
// ...inside Routes:
<Route path="/project/:slug/audit" element={<AuditLogPage />} />
```

- [ ] **Step 4: Run test — PASS**

```bash
npx vitest run src/__tests__/auditLogPage.test.tsx
```

- [ ] **Step 5: Add nav link in TopBar**

Render a "Audit log" menu entry only when `useCan('viewAuditLog')` is true.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/AuditLogPage.tsx src/App.tsx src/components/editor/TopBar.tsx src/__tests__/auditLogPage.test.tsx
git commit -m "feat(audit): AuditLogPage with actor + action filters"
```

### Task 11 — Final verify + PR

- [ ] **Step 1: Gauntlet**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: green, ~390+ tests pass.

- [ ] **Step 2: Push + open PR**

```bash
git push
# PR is the existing Phase 5 PR since everything stacked on one branch.
```

Title: `Phase 5: full RBAC + audit log`.
Body: summarize 5a/5b/5c across one PR; note migration is additive and the SQL tests are manual-run; enumerate emission call sites.

---

## Verification (phase-level)

1. `npx tsc --noEmit` — clean
2. `npx vitest run` — all existing tests pass + new tests (permissions matrix, gating, audit emission, audit page)
3. `npm run build` — clean
4. Manual: set role to `space-planner` via DB or dev hook; roster edit affordances are hidden; map ones remain; `/audit` returns "not authorized".
5. Manual: set role to `hr-editor`; roster edits work; map tool selector is disabled; `/audit` renders the last events.
6. Manual: create/delete an employee; check Supabase `audit_events` table for the corresponding row.

---

## Branching

Start from `feat/phase4-employee-lifecycle` (already checked out as `feat/phase5-rbac-audit`). PR base = `feat/phase4-employee-lifecycle`. When Phase 4 PR #28 merges, PR auto-retargets to main.
