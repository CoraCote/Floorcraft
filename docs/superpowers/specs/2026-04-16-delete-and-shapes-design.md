# Delete Elements + Expanded Shape Library — Design Spec

**Date:** 2026-04-16
**Bundle:** 1 of 3 (part of a larger "editor polish + accounts" arc)
**Status:** Approved for implementation planning
**Target branch:** `feat/delete-and-shapes` (off `feat/floocraft-core`)

## Context

Floorcraft currently ships straight-desk / rectangular-table / workstation / private-office as the only canvas primitives, and offers no UI affordance for deleting placed elements (users have to refresh or remove via undo-after-add). This spec closes both gaps in a single bundle because they share the same surfaces (element type system, canvas renderers, right-sidebar panel, context menu) and have overlapping tests.

Two later bundles are explicitly out of scope here:

- **Bundle 2** — non-straight (polyline / curved) walls
- **Bundle 3** — login, accounts, and per-user cloud persistence

## Goals

1. Users can delete any selected element(s) via keyboard, right-click context menu, or a button in the Properties panel.
2. Deletion cleans up downstream references (employee assignments, doors/windows attached to a deleted wall) atomically, in a single undo step.
3. The element palette includes 14 new shape variants covering the "Essentials + Structural" scope agreed during brainstorming (2 tables, 3 desk/office variants, 9 decor).
4. Previously-saved projects continue to open and render correctly (schema migration on load).

## Non-Goals

- Custom-shape drawing/import
- User-configurable shape geometry (adjustable L-arm length, etc.) — fixed aspect ratios only
- Confirmation dialogs for deletion (explicitly decided against; rely on undo)
- Multi-select lasso/box-select (single-click + Shift-click already covers the common case; lasso is a separate bundle if wanted later)
- Curved walls and auth — see Bundles 2 and 3

## Users and Success Criteria

**Primary user:** office-layout admin working in the editor.

**Ship criteria (must all be true):**

1. Drag or click any of the 14 new shapes from the left palette; an instance appears on the canvas (centered in viewport on click, at the drop location on drag).
2. Select any element and press `Delete` or `Backspace` → the element is removed.
3. Right-click any element → context menu shows "Delete" → clicking removes the element.
4. Select an element → "Delete element" button visible in the Properties panel → clicking removes the element.
5. Deleting a desk with an assigned employee leaves the employee unassigned (`seatId === null`, `floorId === null`) and visible in the unassigned report.
6. Deleting a wall that has doors/windows mounted on it removes those doors/windows in the same atomic step (one undo restores everything).
7. A single `Ctrl/Cmd+Z` after any delete restores the deleted element **and** any side-effects from step 5/6.
8. Projects saved under the previous schema (no `shape` field) open without errors; desks/tables display as their "straight" / "rect" default variant.
9. `npm run build` succeeds. `npm run lint` passes. All existing tests pass. New tests (enumerated below) pass.

## Design

### Part A — Data model

**Principle: sub-discriminate existing element types via a `shape` field; avoid inflating `ElementType`.**

This keeps the existing store logic, assignment flow, property panels, type-guard utilities, and persistence layer intact. Only renderers and palette are type-aware of shape variants.

#### Type changes (in `src/types/elements.ts`)

```ts
// Tables: expand TableType, all still under isTableElement
export type TableType =
  | 'table-rect'
  | 'table-conference'
  | 'table-round'   // NEW
  | 'table-oval'    // NEW

// Desks gain a shape discriminator
export interface DeskElement extends BaseElement {
  type: 'desk' | 'hot-desk'
  shape: 'straight' | 'l-shape' | 'cubicle'  // NEW (default: 'straight')
  deskId: string
  assignedEmployeeId: string | null
  capacity: 1
}

// Private offices gain a shape discriminator (U-Shape variant)
export interface PrivateOfficeElement extends BaseElement {
  type: 'private-office'
  shape: 'rectangular' | 'u-shape'  // NEW (default: 'rectangular')
  deskId: string
  capacity: 1 | 2
  assignedEmployeeIds: string[]
}

// New: Decor is the bucket for purely-visual, non-assignable objects
export interface DecorElement extends BaseElement {
  type: 'decor'
  shape:
    | 'armchair'
    | 'couch'
    | 'reception'
    | 'kitchen-counter'
    | 'fridge'
    | 'whiteboard'
    | 'column'
    | 'stairs'
    | 'elevator'
}

// Add to CanvasElement union + add isDecorElement type guard
```

**Net new top-level types:** 1 (`decor`). Shape variants are additive, non-breaking for anything that doesn't explicitly consume them.

#### Persistence migration (in `src/lib/persistence.ts`)

On load, for each element in the saved payload:

- If `el.type === 'desk' | 'hot-desk'` and `el.shape === undefined` → set `el.shape = 'straight'`
- If `el.type === 'private-office'` and `el.shape === undefined` → set `el.shape = 'rectangular'`
- Leave tables untouched (new TableType values only exist in freshly-created elements)
- Leave everything else untouched

Migration runs in the same load pass that hydrates the store; a one-time save after load normalizes the persisted form. No user-visible upgrade step.

#### Default dimensions + colors (in `src/lib/constants.ts`)

`ELEMENT_DEFAULTS` is extended to cover the new `decor` type and each new shape. Shape-specific defaults live in a new `SHAPE_DEFAULTS[type][shape]` map, falling back to the type-level defaults if no shape override is present. Example values are finalized during implementation; a reasonable starter set:

| Shape | Width | Height | Fill | Stroke |
|---|---|---|---|---|
| `desk / l-shape` | 120 | 100 | `#d4c5b0` | `#6b4423` |
| `desk / cubicle` | 120 | 120 | `#f3f0ea` | `#6b4423` |
| `private-office / u-shape` | 200 | 160 | `#e8dcc4` | `#6b4423` |
| `table-round` | 100 | 100 | `#a7c7e7` | `#1e40af` |
| `table-oval` | 140 | 90 | `#a7c7e7` | `#1e40af` |
| `decor / armchair` | 60 | 60 | `#c4a57b` | `#6b4423` |
| `decor / couch` | 150 | 60 | `#c4a57b` | `#6b4423` |
| `decor / reception` | 180 | 90 | `#d4c5b0` | `#6b4423` |
| `decor / kitchen-counter` | 200 | 60 | `#cbd5e1` | `#475569` |
| `decor / fridge` | 70 | 70 | `#e2e8f0` | `#475569` |
| `decor / whiteboard` | 140 | 20 | `#ffffff` | `#475569` |
| `decor / column` | 40 | 40 | `#94a3b8` | `#334155` |
| `decor / stairs` | 120 | 80 | `#e2e8f0` | `#475569` |
| `decor / elevator` | 100 | 100 | `#e2e8f0` | `#475569` |

### Part B — Shape rendering

New folder: `src/components/editor/Canvas/shapes/`

One file per rendered shape variant, each exporting a pure function component that takes `(element, isSelected)` and returns Konva nodes. This keeps `ElementRenderer.tsx` small and makes adding future shapes trivial.

```
src/components/editor/Canvas/shapes/
├── TableRoundShape.tsx
├── TableOvalShape.tsx
├── DeskLShape.tsx
├── DeskCubicleShape.tsx
├── PrivateOfficeUShape.tsx
├── DecorArmchair.tsx
├── DecorCouch.tsx
├── DecorReception.tsx
├── DecorKitchenCounter.tsx
├── DecorFridge.tsx
├── DecorWhiteboard.tsx
├── DecorColumn.tsx
├── DecorStairs.tsx
├── DecorElevator.tsx
└── index.ts       // dispatch map: (type, shape) -> component
```

`ElementRenderer.tsx` gains a single switch on `type` that falls through to the shapes dispatch for the variants it owns. Existing renderers for `straight desk`, `rectangular office`, and `rect table` remain untouched.

### Part C — Seat geometry

`src/lib/seatLayout.ts` gains:

```ts
export function computeRoundTableSeats(count: number, width: number, height: number): SeatPosition[]
export function computeOvalTableSeats(count: number, width: number, height: number): SeatPosition[]
```

Both distribute seats evenly around the perimeter with rotation pointing toward the table center.

For L-shape and U-shape desks, seat position is deterministic from shape + dimensions:

- **L-shape desk** — chair sits at the inside corner; offset = (width * 0.25, height * 0.25), rotation = 45°
- **U-shape desk (capacity 1)** — chair at crossbar center; offset = (0, -height * 0.25), rotation = 180°
- **U-shape desk (capacity 2)** — two chairs on opposite arms; offsets = (±width * 0.3, 0), rotation = ±90°
- **Cubicle** — chair at center, rotation 0°

These live as inline helpers inside the shape components (not exported) since no other code needs them.

### Part D — Palette (left sidebar)

`src/components/editor/LeftSidebar/ElementLibrary.tsx` is rewritten to:

- Group items by `category` (unchanged mechanism) with new categories: **Tables / Desks / Seating / Rooms / Structure / Facilities / Other**
- Render a small icon preview (inline SVG matching the shape silhouette) alongside the label, replacing today's text-only list
- Scroll within a fixed sidebar height (the palette will now exceed viewport on some screens)
- Each item, on click or drag, calls the existing `handleAddElement` with a new `shape` override where relevant

The palette is data-driven from a single `LIBRARY_ITEMS` array; adding future shapes requires adding one row.

### Part E — Delete UX

**Single entry point, three triggers.**

New helper in `src/lib/seatAssignment.ts`:

```ts
/**
 * Atomically delete one or more elements from the active floor, cleaning up
 * any downstream references (employee assignments, wall-attached doors/windows).
 * All mutations are applied in a single store update so zundo sees it as one
 * undo step.
 */
export function deleteElements(elementIds: string[]): void
```

Implementation:

1. Snapshot current elements map
2. For each `id` in `elementIds`:
   - If the element is a wall, collect any `door` / `window` with `parentWallId === id` and add them to the deletion set
   - If the element is assignable (desk/workstation/private-office), collect its employees to unassign
3. In ONE `setState`:
   - Remove all collected element ids from `elementsStore.elements`
   - For each collected employee id, clear `seatId` + `floorId` on the employee record

This yields a single zundo snapshot, so `Cmd+Z` fully reverses the operation.

**Triggers wired to `deleteElements`:**

- **Keyboard** — `src/hooks/useKeyboardShortcuts.ts`: on `Delete` / `Backspace`, if `selectedIds.length > 0` and the active element is not an `<input>` / `<textarea>` / `[contenteditable]`, call `deleteElements(selectedIds)` and clear selection.
- **Context menu** — `src/components/editor/ContextMenu.tsx`: add a "Delete" item (red text) at the bottom of the menu shown when right-clicking a canvas element. Disabled when the element is `locked`.
- **Properties panel** — `src/components/editor/RightSidebar/PropertiesPanel.tsx`: add a red "Delete element" button at the bottom of the panel whenever `selectedIds.length >= 1`. Button text pluralizes: "Delete element" / "Delete 3 elements".

**No confirmation dialogs.** Undo is always one keystroke away; the existing `useKeyboardShortcuts` hook already binds `Cmd/Ctrl+Z`.

**Locked elements** are excluded from the delete: `deleteElements` internally filters out any id whose element has `locked === true`, and the Properties panel button is hidden when all selected elements are locked.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         User interactions                         │
│  Delete key      Right-click menu      Properties panel button    │
└────────┬──────────────────┬────────────────────┬─────────────────┘
         │                  │                    │
         ▼                  ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│  useKeyboardShortcuts   ContextMenu.tsx   PropertiesPanel.tsx    │
│                  all dispatch to one helper                       │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│          seatAssignment.ts :: deleteElements(ids)                 │
│  - collect cascade (walls -> doors/windows)                       │
│  - collect employees to unassign                                  │
│  - single setState applies all mutations atomically               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  elementsStore + employeeStore
                  (one zundo snapshot)
```

## Testing

All tests use the existing Vitest + React Testing Library setup.

### Unit — `src/lib/seatAssignment.test.ts` (new cases)

1. `deleteElements([deskId])` with an employee assigned → element gone from store, employee has `seatId === null`.
2. `deleteElements([wallId])` with a door mounted → both wall and door gone in one store update.
3. `deleteElements([wallId])` with two doors and a window → all four ids removed.
4. `deleteElements([lockedDeskId])` → no-op, element remains.
5. `deleteElements([a, b, c])` mixing assignable and decorative elements → all removed, only the assignable ones trigger unassign.
6. After any delete, `useTemporalStore.getState().undo()` restores the elements map AND re-assigns the employees to their previous seats.

### Unit — `src/lib/seatLayout.test.ts` (new cases)

7. `computeRoundTableSeats(4, 100, 100)` → 4 positions on perimeter, all rotations point to center.
8. `computeRoundTableSeats(8, 100, 100)` → 8 positions evenly spaced.
9. `computeOvalTableSeats(6, 140, 90)` → 6 positions, top and bottom seats on the long axis.

### Component — `ElementLibrary.test.tsx`

10. Renders all 7 categories with correct shape counts.
11. Clicking "Round Table" adds an element with `type === 'table-round'` and default seat count.
12. Clicking "L-Shape Desk" adds an element with `type === 'desk'` and `shape === 'l-shape'`.

### Component — `PropertiesPanel.test.tsx`

13. With one element selected, "Delete element" button is visible.
14. With no selection, button is not rendered.
15. Clicking the button calls `deleteElements` with the selected id(s).

### Integration — `DeleteFlow.test.tsx` (new)

16. Render editor with a desk + assigned employee → select desk → press Delete → desk gone, employee in unassigned list, undo restores both.

### Persistence — `persistence.test.ts` (new cases)

17. Load a project payload containing a desk with no `shape` field → hydrated element has `shape === 'straight'`.
18. Load a payload with a private-office lacking `shape` → hydrated element has `shape === 'rectangular'`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Saved projects break on load due to missing `shape` | Data loss / crash | Persistence migration defaults the field; covered by tests 17–18. |
| U-shape seat math wrong when rotated | Visual glitch | Seat math runs in element local-space, rotation applied by Konva group — same pattern as rectangular desks. |
| Delete key triggers while typing in the Label input | Data loss | Hook checks active element is not a form input / contenteditable before dispatching. |
| Context menu "Delete" on a locked element | User frustration | Menu item disabled; `deleteElements` defensively filters locked ids. |
| Bundle size creep from 14 new shape files | Perf | Each file is ~100 LOC of Konva nodes. Editor chunk is already lazy-loaded. Budget: +15 KB gzipped; verified with `npm run build` size report in PR. |
| New TableType values confuse legacy `isTableElement` guard | Type error | Guard updated to accept all 4 variants; TS compiler catches any missed call site. |

## Work Breakdown (for writing-plans)

1. Type system — add `shape` discriminators, `DecorElement`, update `CanvasElement` union, update type guards, update `TableType`.
2. Persistence migration + tests.
3. `SHAPE_DEFAULTS` constants + defaults wiring in `ELEMENT_DEFAULTS`.
4. Shape renderers folder + dispatch map.
5. Wire shape renderers into `ElementRenderer.tsx`.
6. Seat geometry helpers (round/oval) + tests.
7. `deleteElements` helper in `seatAssignment.ts` + tests.
8. Keyboard shortcut wiring.
9. ContextMenu "Delete" item.
10. PropertiesPanel "Delete element" button.
11. LeftSidebar `ElementLibrary` rewrite (categorized, icon previews, scrollable).
12. Integration test (`DeleteFlow`).
13. Manual QA checklist against ship criteria.
14. Build size report in PR description.
