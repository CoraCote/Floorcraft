# Pilot Readiness Roadmap — Design

**Date:** 2026-04-23
**Driver:** HR-persona audit surfaced 18+ items across safety, onboarding, lifecycle, governance, reporting, and polish. First real pilot customer onboarding imminent; they will hit every flow in the first two weeks.
**Ordering principle:** Reliability-first — ship improvements in an order that a pilot customer will feel, while designing governance (RBAC + audit log) from evidence rather than speculation.

---

## Executive summary

Seven implementation phases, each a separate spec + plan + PR cycle. Phase 1 ships safety fixes plus a minimal `admin | viewer` role so the subsequent phases are built on a permission model from day one. Phase 5 grows that into a full four-role model with an audit log once the governed flows have stabilized. Phase 8 is explicitly deferred until post-pilot feedback.

| Phase | Cluster | Size | Ships |
|---|---|---|---|
| 1 | Safety papercuts + Viewer role | Small | Confidence in destructive actions; minimal RBAC |
| 2 | CSV import hardening | Small–Med | Non-silent roster onboarding |
| 3 | Roster power ops | Medium | Bulk edit, multi-seat assign, find-on-map |
| 4 | Employee lifecycle | Medium | Leave metadata, scheduled departures |
| 5 | Governance: Full RBAC + audit log | Large | Four-role model, compliance-ready audit trail |
| 6 | Utilization reporting | Medium | Per-floor, per-dept, unassigned roster reports |
| 7 | Invites & sharing polish | Small–Med | Invite polish, read-only share links, ? overlay |
| 8 | Nice-to-haves | — | **Deferred**; revisit after pilot feedback |

---

## Phase 1 — Safety papercuts + Viewer role

**Goal:** Eliminate destructive-action footguns; add minimal RBAC so the pilot is never "everyone is admin."

**Scope:**
1. Replace `window.confirm()` with `ConfirmDialog` in `src/components/editor/FloorSwitcher.tsx` and `src/components/team/TeamSettingsMembers.tsx`.
2. Floor-delete dialog surfaces assigned-employee count: *"Floor 3 has 12 assigned employees. They will be unassigned. Continue?"*
3. Desk-rename uniqueness validation per floor. Inline error in `src/components/editor/RightSidebar/PropertiesPanel.tsx`; duplicate name blocks save.
4. Undo-with-data-loss toast — when zundo restores a deleted assignable element whose assignment was stripped by `partialize` (see `src/stores/elementsStore.ts:225-249`), show: *"Desk restored — Jane Doe's assignment not recovered. Reassign?"* with a "Reassign" button that opens the roster filtered to the affected employee.
5. New `role: 'admin' | 'viewer'` field on `TeamMember`. `useCanEdit()` hook gates every mutating action. Viewer sees all buttons but they are disabled + tooltip: *"Read-only access. Contact an admin to make changes."*

**Data model:**
- Add `role: 'admin' | 'viewer'` to `TeamMember`. Existing rows default to `'admin'`.

**Permissions behavior (minimal):**
- Viewer: hidden/disabled on all editing UI across Map, Roster, TeamSettings.
- Admin: unchanged behavior.

**Testing:**
- `src/__tests__/floorDeleteConfirm.test.tsx` — dialog renders assigned-count; cancel preserves floor; confirm cascades unassigns.
- `src/__tests__/deskRenameUniqueness.test.tsx` — duplicate deskId on same floor rejected; different floors allowed.
- `src/__tests__/undoDataLossToast.test.tsx` — deleting an assigned desk then undo triggers toast with correct employee name.
- `src/__tests__/viewerRole.test.tsx` — viewer sees buttons disabled; admin sees them enabled.

**Done when:** all four bugs fixed, Viewer role enforced across Map + Roster + TeamSettings, tests per item green, tsc + vitest + build clean.

---

## Phase 2 — CSV Import Hardening

**Goal:** Make roster onboarding non-silent.

**Scope:**
1. Replace success toast with a **result summary modal** after import. Counts: *N imported, M skipped, K warnings*. Per-row list with reason codes.
2. Reason codes: `blank_name`, `manager_unresolved`, `duplicate_email`, `invalid_status`, `invalid_start_date`.
3. "Download skipped rows CSV" button inside the modal. Downloaded CSV matches input format so HR can fix + re-import.
4. **Round-trip guarantee:** `src/lib/employeeCsv.ts` owns both `serialise(employees): string` and `parse(text): {imported, skipped}` in one module. Column order locked. Test: export 20 employees → parse → assert equality.

**Data model:** none.

**Key design decisions:**
- Parser never throws on per-row errors; each bad row becomes a `SkippedRow` entry with reason code + original row index + raw values.
- Module-level errors (malformed CSV, unknown columns) still throw — shown as modal error with raw message.
- Modal blocks further interaction until acknowledged (user must click "Done" or "Download skipped").

**Testing:**
- `src/__tests__/employeeCsvRoundTrip.test.ts` — 20 employees → serialise → parse → deep equal.
- `src/__tests__/employeeCsvSkippedRows.test.ts` — seeded errors produce correct reason codes.
- `src/__tests__/csvImportSummaryModal.test.tsx` — modal renders counts; download button produces a valid CSV.

**Done when:** 200-row CSV with seeded errors produces correct summary + downloadable error CSV + round-trip test green.

---

## Phase 3 — Roster power ops

**Goal:** Make 100+ person workflows not miserable.

**Scope:**
1. **Bulk edit** — existing bulk-action bar (when rows selected) gets an "Edit" button → opens a mini-form for `department`, `title`, `status`, `team`. Apply to all selected as a single undoable action.
2. **Multi-seat assignment** — employees-first flow:
   - Select N employees in the roster.
   - "Assign to…" button → click a desk cluster on the map.
   - Assigns selected employees to the cluster's desks in name order.
   - If cluster has fewer desks than selected, remaining employees stay unassigned (with a toast noting the overflow count).
3. **Find-on-map** — click the seat cell in the roster table (or the "Seat" field in `RosterDetailDrawer`) → navigates to `/project/:slug/map`, calls `switchToFloor(employee.floorId)`, `setSelectedIds([employee.seatId])`, and pans/zooms to center the seat. Flash ring for 1.5s.
4. New utility `src/lib/canvasFocus.ts` with `focusOnElement(id: string, stage: Konva.Stage)` that handles pan + zoom + flash.

**Data model:** none.

**Testing:**
- `src/__tests__/bulkEditMini­Form.test.tsx` — select 3 rows → edit dept → store reflects change for all 3; single undo reverts all 3.
- `src/__tests__/multiSeatAssign.test.tsx` — select 5 employees, click 8-desk cluster, first 5 desks get assigned in name order.
- `src/__tests__/findOnMap.test.tsx` — click seat cell → URL changes to /map, selected id matches seat id.

**Done when:** bulk-edit 40 employees in one action; assign 8-person team to a cluster in <10 clicks; find-on-map works from table and card views.

---

## Phase 4 — Employee lifecycle

**Goal:** Real attrition + leave tracking, not just status flips.

**Scope:**
1. **Leave metadata** — when `status` changes to `on-leave`, an inline form captures:
   - `leaveType`: `parental | medical | sabbatical | other`
   - `expectedReturnDate`: ISO date string
   - `coverageEmployeeId`: optional (searchable combobox over employees)
   - `leaveNotes`: free-text
   Stored on `Employee`. Leave banner rendered in `RosterDetailDrawer` and as a chip on the row.
2. **Scheduled departures** — new `departureDate: string | null` on `Employee`. Setting a future date adds a "Departing Mon Jun 2" badge on the row.
3. **"Departing soon" filter chip** on the roster — chip active → filter to employees with `departureDate !== null && departureDate >= today`. No automatic status flip; HR flips manually when the day arrives.
4. Profile drawer shows leave banner + departure banner when applicable.

**Data model:**
- Add to `Employee`: `leaveType`, `expectedReturnDate`, `coverageEmployeeId`, `leaveNotes`, `departureDate`. All optional, default null.

**Migration:** `loadAutoSave()` back-fills all five fields to null for legacy employees.

**Testing:**
- `src/__tests__/leaveMetadata.test.tsx` — flip to on-leave → form required; saving persists fields; banner renders.
- `src/__tests__/scheduledDeparture.test.tsx` — set future departureDate → badge renders; filter chip shows only those rows.
- `src/__tests__/employeeLifecycleMigration.test.ts` — legacy payload without new fields loads with null.

**Done when:** on-leave captures full metadata; scheduled departure badge renders; filter chip works; migration test green.

---

## Phase 5 — Governance: Full RBAC + audit log

**Goal:** Four-role model + pilot-ready audit trail. Ships as 3 PRs.

### PR 5a — Supabase schema + RLS

**Scope:**
- Migrate `TeamMember.role` enum: `admin | viewer` → `Owner | HR Editor | Space Planner | Viewer`.
- New `audit_events` table: `id uuid PK, workspace_id uuid FK, actor_id uuid FK, action text, target_type text, target_id text, metadata jsonb, created_at timestamptz default now()`.
- RLS policies mirror the permissions matrix (see PR 5b).
- Migration logic:
  - Existing `admin` where `user_id = workspace.created_by` → `Owner`.
  - Other `admin` rows → `HR Editor`.
  - Existing `viewer` → `Viewer`.
- New `supabase/tests/rls_roles.sql` — SQL tests asserting a Viewer token cannot INSERT/UPDATE/DELETE on employees, floors, elements; HR Editor can mutate employees but not elements; Space Planner vice-versa.

**Deploy first, verify, then ship PR 5b.** Additive migration — old role values remain accepted during the transition window.

### PR 5b — Client permissions refactor

**Scope:**
- Central `src/lib/permissions.ts`:
  ```ts
  export type Role = 'Owner' | 'HR Editor' | 'Space Planner' | 'Viewer'
  export type Action =
    | 'editRoster' | 'editMap' | 'manageTeam' | 'viewAuditLog'
    | 'viewReports' | 'manageBilling' | 'generateShareLink'
  export const permissions: Record<Role, Action[]> = { ... }
  export function can(role: Role, action: Action): boolean { ... }
  ```
- Replace Phase 1's `useCanEdit()` with `useCan(action: Action)`.
- Every mutating UI call site updated to gate via `useCan`.
- Role-change UI in `TeamSettingsMembers` (Owner-only).

**Testing:**
- `src/__tests__/permissions.test.ts` — matrix truth table; unknown roles default deny.
- `src/__tests__/rolePermissionGating.test.tsx` — HR Editor sees map buttons disabled; Space Planner sees roster edit disabled; Viewer sees everything disabled.

### PR 5c — Audit log UI + emission

**Scope:**
- `src/lib/audit.ts` — `emit(action, targetType, targetId, metadata)` posts to `audit_events`.
- Emission call sites: `employeeStore` (create/update/delete), `seatAssignment.ts` (assign/unassign), `elementsStore` (element.delete), `FloorSwitcher` (floor.create/delete), `TeamSettingsMembers` (member.add/remove/role_change), `CSVImportDialog` (csv.import with row-count metadata).
- **Best-effort writes:** failed audit post logs to `console.error` + telemetry counter; does not block the user's action. Retry not attempted.
- New `/project/:slug/audit` route. Owner + HR Editor can view (per permissions matrix); Space Planner + Viewer cannot.
- Filterable table: actor (dropdown), action (dropdown), date range, target search.
- Retention: 12 months, enforced by a Supabase cron job deleting events older than 365 days. No UI for purge.

**Testing:**
- `src/__tests__/auditEmission.test.ts` — every emission call site fires correct event shape.
- `src/__tests__/auditLogPage.test.tsx` — filters narrow results; sort by date; role gating.

**Phase 5 done when:** role matrix enforced in UI + RLS; every listed event appears in the audit page; filter by actor/action/date works; tests green.

---

## Phase 6 — Utilization reporting

**Goal:** Answer "Floor 2 is 94% assigned, Floor 3 is 38% — can we consolidate?"

**Scope:**
- New `/project/:slug/reports` page. Three cards:
  1. **Per-floor utilization** — `assigned / total assignable elements` per floor, color-coded bar (red <50%, yellow 50–80%, green >80%).
  2. **Per-department headcount** — count per dept + % of total + seat-assignment rate per dept (assigned / total in dept).
  3. **Unassigned roster** — count + scrollable list, click-through to roster filtered to unassigned.
- CSV export button per card — exports the card's current data in the same format users expect for spreadsheet sharing.
- All reports are point-in-time snapshots. No historical trends (YAGNI — would need time-series storage).
- **Permissions:** Owner, HR Editor, Space Planner can view. Viewer cannot.

**Data model:** none.

**Testing:**
- `src/__tests__/reportsCalculations.test.ts` — unit tests on pure calculator functions (given store state → expected numbers).
- `src/__tests__/reportsPage.test.tsx` — page renders three cards with seeded data; CSV export content matches.
- `src/__tests__/reportsPermissions.test.tsx` — Viewer gets 403/redirect.

**Done when:** three cards render accurate numbers; CSV export matches card contents; role gating correct.

---

## Phase 7 — Invites, sharing, polish

**Goal:** Fix onboarding paper-cuts and ship the shareable read-only map.

**Scope:**
1. `src/components/team/InvitePage.tsx` displays workspace name + inviter name: *"Sarah invited you to Acme Corp."*
2. **Resend verification email** button on signup-pending state. Client-side rate-limit: 1 request per 30 seconds; counter visible as "Resend available in 23s".
3. **Hide demo office button** from primary CTAs. Move to "+ New project → From template → Sample Office" flow.
4. **Read-only share link:**
   - New Supabase table `share_tokens`: `id, project_id, token (random 32-char), created_by, created_at, revoked_at`.
   - Owner-only "Generate share link" button in project settings.
   - Route `/shared/:projectId/:token` — no auth required; renders read-only map + roster; all editing buttons hidden.
   - Token lookup returns 404 if `revoked_at IS NOT NULL`.
   - No auto-expiry. Owner must revoke manually.
5. **Keyboard shortcut overlay** — pressing `?` in the editor opens a modal listing all shortcuts.

**Data model:**
- New `share_tokens` table.

**Testing:**
- `src/__tests__/invitePage.test.tsx` — workspace name + inviter name render.
- `src/__tests__/resendVerification.test.tsx` — button disables + counter counts down; second click after 30s succeeds.
- `src/__tests__/shareLinkView.test.tsx` — /shared route renders read-only view; editing buttons absent.
- `supabase/tests/share_tokens.sql` — token lookup with revoked_at returns no rows.

**Done when:** all five items shipped; share link works from an incognito window; invite page tests pass.

---

## Phase 8 — Nice-to-haves (deferred)

Explicitly **not scoped** in this roadmap. Revisit after pilot feedback. Candidates:
- Zones / neighborhoods on the map (tag-inherit to assigned employees)
- Hot-desking / hoteling (pool-based seats, reservation calendar)
- Photo avatars in roster table (data field exists, just needs render)
- Manager-tree visualization
- Slack / Teams "mark me on leave" integration
- Floor-naming suggestions

**Decision rule:** if pilot asks for ≥2, those two become Phase 9 and get their own design pass. If pilot doesn't ask, drop from roadmap.

---

## Cross-cutting concerns

### Data model summary

| Phase | Field / Table | Type | Default / Back-fill |
|---|---|---|---|
| 1 | `TeamMember.role` | `'admin' \| 'viewer'` | existing → `'admin'` |
| 4 | `Employee.leaveType` | enum nullable | null |
| 4 | `Employee.expectedReturnDate` | ISO date nullable | null |
| 4 | `Employee.coverageEmployeeId` | FK nullable | null |
| 4 | `Employee.leaveNotes` | text nullable | null |
| 4 | `Employee.departureDate` | ISO date nullable | null |
| 5 | `TeamMember.role` | widened to 4-value enum | `admin` → `Owner` (creator) / `HR Editor` (others); `viewer` → `Viewer` |
| 5 | `audit_events` | new table | empty at deploy |
| 7 | `share_tokens` | new table | empty at deploy |

Client-side legacy-payload migrations live in `src/hooks/useAutoSave.ts#loadAutoSave()`, extending the existing pattern (wall bulges, employee status).
Supabase schema migrations live in `supabase/migrations/`.

### Testing strategy

- **Unit tests** for every new pure function. Extend the existing `src/__tests__/` pattern.
- **Integration tests** with React Testing Library for every new page or meaningful UI flow.
- **Migration tests** for every back-fill — legacy payload loads with correct defaults.
- **Supabase RLS tests** for Phase 5 — SQL tests in `supabase/tests/` verify non-admin tokens cannot mutate protected tables.
- `npx tsc --noEmit`, `npx vitest run`, `npm run build` all green before every merge.

### Feature flags & rollout

- **No feature flags in code.** Each phase ships per PR, merged = live. Matches existing cadence and keeps the codebase free of long-lived toggles.
- **Phase 5 exception:** the RBAC role-enum widening is not cleanly reversible. Split into 3 PRs:
  1. **PR 5a** — Supabase schema + RLS. Additive; old enum values still accepted during transition. Deploy, verify, monitor.
  2. **PR 5b** — Client permissions refactor. Ships after 5a is confirmed stable on prod.
  3. **PR 5c** — Audit log emission + UI.
- Phase 7 share-link is guarded by an Owner-only "Generate link" button — no public exposure until explicit action.

### Risk register

| Phase | Risk | Mitigation |
|---|---|---|
| 1 | Viewer role retrofit breaks an existing admin-only flow | `useCanEdit()` defaults to allow for unknown actions during transition; strict allow-list grows as flows migrate |
| 2 | Round-trip CSV test locks column order — future column additions need test updates | Accept — that is the point of the test |
| 4 | Scheduled-departure badge uses client clock; wrong clock → wrong badge | Low impact (badge only, no auto-action); accept |
| 5 | RLS policies block legitimate admin actions in prod | Staging validation before prod; PR 5a deploys alone and is monitored before PR 5b |
| 5 | Audit write fails silently, events missed | Best-effort write + telemetry counter; non-zero failure rate triggers investigation |
| 7 | Share-link token leaks sensitive roster data | Token revocable + Owner-only; no PII in the URL; 32-char random entropy |

### PR cadence

- One PR per phase, except Phase 5 which is 3 PRs.
- Each PR: green CI + manual smoke + tests per the phase's "Done when" criteria.
- Spec doc per phase (this file becomes the parent; per-phase specs under `docs/superpowers/specs/YYYY-MM-DD-pilot-phaseN-<topic>-design.md` when each phase starts).
- Implementation plans per phase under `docs/superpowers/plans/`.

---

## Sequencing recap

1. **Phase 1** (safety + minimal RBAC) — no architectural surprises, fast to ship, establishes permission substrate.
2. **Phase 2** (CSV hardening) — roster onramp; pilot day-1 critical.
3. **Phase 3** (roster power ops) — bulk operations that 100+ person workflows demand.
4. **Phase 4** (lifecycle) — leave + departure make this feel HRIS-adjacent.
5. **Phase 5** (governance) — full RBAC + audit log, designed from the patterns 1–4 exposed.
6. **Phase 6** (reporting) — the "why we bought this tool" pitch.
7. **Phase 7** (polish + sharing) — finishing touches + shareable read-only links.
8. **Phase 8** — deferred, revisit post-pilot.
