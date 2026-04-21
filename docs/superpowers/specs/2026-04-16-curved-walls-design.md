# Curved Walls — Design Spec

**Date:** 2026-04-16
**Bundle:** 2 of 3 (part of a larger "editor polish + accounts" arc)
**Status:** Approved for implementation planning
**Target branch:** `feat/curved-walls` (off `feat/floocraft-core`)

## Context

Floorcraft currently supports walls as multi-segment polylines only — click, click, double-click gives you a chain of straight segments. Real office layouts routinely include rounded reception desks, curved lobby perimeters, and radiused meeting-room walls; SmartDraw, Lucid, and AutoCAD all ship an arc tool in their wall family. Without curves, users either work around the limitation (approximating arcs with many short straight segments, which breaks at low zoom and is painful to edit) or leave Floorcraft for another tool.

This bundle adds **circular-arc segments** to the existing polyline wall, inside a single unified wall tool, without changing any of today's drawing or editing muscle memory. It is the second of three bundles in the "editor polish + accounts" arc:

- **Bundle 1** — Delete + expanded shape library (shipped)
- **Bundle 2 (this spec)** — Curved walls
- **Bundle 3** — Login, accounts, per-user cloud persistence

## Goals

1. Users can draw a wall whose segments are a mix of straight lines and circular arcs, using the existing Wall tool — no new palette entry, no modifier keys.
2. **Click** inserts a straight point (today's behavior, unchanged). **Click-drag** inserts a curved segment whose bulge is proportional to the drag distance perpendicular to the chord.
3. Selecting an existing wall shows a green midpoint handle on every segment; dragging that handle bends the segment (or un-bends it). This affordance works on walls drawn before this feature — no migration needed.
4. Arcs render as true circular arcs (not droopy beziers), preserve thickness/caps/joins, and are hit-testable at the full thickness of the wall.
5. Doors and windows are explicitly **blocked** from attaching to arc segments. Dropping one on an arc either rejects (red outline) or snaps to the nearest straight segment on the same wall.
6. Previously-saved projects continue to open and render correctly. Walls authored before this feature load as all-straight.
7. `npm run build` succeeds. `npm run lint` passes. All existing tests pass. New tests (enumerated below) pass.

## Non-Goals

- Bezier / S-curve / freeform path walls (explicitly rejected during brainstorm)
- Doors and windows on arc segments (blocked by design; revisit in a later bundle if users ask)
- Dimension labels on arc length or radius
- Arc-to-arc tangent continuity (G1/G2) or snap-to-tangent
- Angle snapping specific to arc geometry (grid snapping of endpoints is inherited; the bulge handle snaps to grid while dragging but nothing cleverer)
- A dedicated "Arc Wall" palette item (single Wall tool only)
- Splitting an arc into a straight sub-segment for door placement (user can un-bend the segment instead)
- Export formats (DXF, SVG) specific to curved walls — existing export behavior, if any, continues unchanged

## Users and Success Criteria

**Primary user:** office-layout admin working in the editor.

**Ship criteria (must all be true):**

1. With the Wall tool active, clicking point A then point B and double-clicking produces a single straight-segment wall, identical to today.
2. With the Wall tool active, clicking point A then **click-dragging** point B produces a wall with one arc segment bulging toward the drag offset; releasing the mouse commits that segment and the next click starts a new segment from B.
3. A wall may mix straight and arc segments in the same polyline (e.g. click, click, click-drag, click, double-click).
4. Selecting a wall renders an endpoint handle at each vertex and a **green midpoint handle** at each segment midpoint. Dragging a midpoint handle perpendicular to its chord bends that segment; dragging it back through the chord flattens it.
5. Arc segments render as true circular arcs using `Konva.Path`, preserving `thickness`, `lineCap: "round"`, and `lineJoin: "round"`.
6. Hit-testing on an arc segment works at the visual thickness of the wall (clicking anywhere on the drawn arc selects the wall).
7. Opening a project saved before this feature succeeds; every wall renders as today's straight polyline (no visual diff) and has no `bulges` array.
8. Attempting to drop a door or window tool on an arc segment is rejected with a visible red-outline cue; the same drop on a straight segment of the same wall succeeds as today.
9. `Ctrl/Cmd+Z` after bending a segment restores the previous bulge (existing zundo integration — no special work needed).
10. `npm run build`, `npm run lint`, `npm run test` all pass.

## Design

### Part A — Data model

**Principle: additive, optional, backward compatible. No migration.**

`WallElement` gains one optional field. Existing files continue to deserialize unchanged.

#### Type changes (in `src/types/elements.ts`)

```ts
export interface WallElement extends BaseElement {
  type: 'wall'
  points: number[]                // unchanged: [x0,y0, x1,y1, x2,y2, ...]
  bulges?: number[]               // NEW: length === segmentCount; 0 = straight
  thickness: number
  connectedWallIds: string[]
}
```

- `bulges[i]` is the **signed perpendicular offset**, in world units, from the midpoint of the straight chord `(points[i], points[i+1])` to the midpoint of the arc. Sign convention: **positive = bulge to the left of the chord direction** (looking from start to end).
- `bulges` is optional. `undefined`, missing, or an all-zero array all mean "straight polyline" and render identically.
- When present, `bulges.length === (points.length / 2) - 1`. Implementation normalizes: too-short arrays are padded with zeros; too-long arrays are truncated. This is defensive — normal code paths keep them in sync.

#### Persistence (in `src/hooks/useAutoSave.ts` + `loadAutoSave`)

No migration code needed. The autosave payload is a JSON blob via `JSON.stringify`; omitted optional fields load as `undefined`, which the renderer treats as all-straight. A one-time save after any edit normalizes the persisted form to include `bulges: []` (or the real array) on touched walls.

### Part B — Rendering

`WallRenderer.tsx` switches from `Konva.Line` to `Konva.Path` when any `bulge` is non-zero; keeps `Konva.Line` in the straight-only case (no perf regression for the common path).

#### New helper: `src/lib/wallPath.ts`

```ts
export interface WallSegment {
  x0: number; y0: number
  x1: number; y1: number
  bulge: number        // 0 = straight
}

/** Split a WallElement into its ordered segments. */
export function wallSegments(points: number[], bulges?: number[]): WallSegment[]

/** Build an SVG path "d" string for a wall. Straight segments become L,
 *  arc segments become A commands computed from endpoints + bulge. */
export function wallPathData(points: number[], bulges?: number[]): string

/** Sample N points along an arc segment (for hit-test / door rejection). */
export function sampleArc(seg: WallSegment, samples: number): Point[]

/** Geometry: given endpoints + bulge, return {cx, cy, radius, startAngle, endAngle, sweep, large}. */
export function arcFromBulge(seg: WallSegment): ArcGeometry | null  // null if bulge === 0

/** Tangent direction (unit vector) at parametric t∈[0,1] along the segment. */
export function tangentAt(seg: WallSegment, t: number): Point

/** Midpoint of a segment (arc-midpoint if bulged, chord-midpoint if straight). */
export function segmentMidpoint(seg: WallSegment): Point
```

**Arc math (for reviewers):**
Given chord endpoints `P0`, `P1` with chord length `c = |P1 - P0|` and perpendicular bulge distance `b` (the field in `bulges[i]`):

- `sagitta s = b`
- `radius r = (c² + 4s²) / (8·|s|)` (when `s ≠ 0`)
- `center = chordMidpoint + perpendicularUnit · (r - |s|) · -sign(s)`
- `sweep` direction = sign of `b` (positive = counter-clockwise in screen space, flipped because y grows downward)
- `largeArc = 0` always (we never allow a bulge large enough to create a >180° arc in v1 — enforced by clamping `|b| ≤ c/2` during drag; see Part C)

For rendering, the SVG `A rx ry x-axis-rotation large-arc sweep x y` command encodes this directly: `rx = ry = r`, `x-axis-rotation = 0`, `large-arc = 0`, `sweep = b > 0 ? 1 : 0` (in canvas/SVG coords).

#### `WallRenderer.tsx` update

```tsx
// pseudo
const hasAnyBulge = (element.bulges ?? []).some((b) => b !== 0)

if (!hasAnyBulge) {
  return <Line points={element.points} ... />   // unchanged fast path
}

const d = wallPathData(element.points, element.bulges)
return (
  <Path
    data={d}
    stroke={...}
    strokeWidth={element.thickness}
    lineCap="round"
    lineJoin="round"
    hitStrokeWidth={Math.max(12, element.thickness + 6)}
  />
)
```

### Part C — Drawing UX (click-drag to bend)

`src/hooks/useWallDrawing.ts` gains drag-distinguishing state. High-level transitions:

1. `mousedown` during drawing → start a "pending vertex" with `(x, y)` and a drag-detection timer.
2. If mouse moves more than `DRAG_THRESHOLD = 4` px before mouseup, we're in **drag mode**: the current segment will be an arc. Live preview draws the arc using the current pointer's perpendicular offset from the pending chord as the bulge.
3. On `mouseup`:
   - If we stayed under the threshold, treat as **click**: commit the point as a straight vertex (today's behavior).
   - If we dragged, commit the point **and** push the final bulge into the drawing state's `bulges: number[]`. The next segment starts from that point.
4. Double-click to commit the wall — unchanged, except we now also persist `bulges` on the committed `WallElement`.

#### Hook shape change

```ts
interface WallDrawingState {
  isDrawing: boolean
  points: number[]
  bulges: number[]               // NEW; length === (points.length/2) - 1
  currentPoint: { x: number; y: number } | null
  dragging: { startX: number; startY: number } | null   // NEW
}
```

New handlers:

- `handleCanvasMouseDown(x, y)` — sets `dragging = { startX, startY }` when the tool is wall and we're actively drawing. The outer `Canvas` component already receives raw pointer events; we split today's `handleCanvasClick` into press/move/release.
- `handleCanvasMouseUp(x, y)` — if `dragging` present and pointer moved ≥ DRAG_THRESHOLD, compute `bulge` (see clamping below) and push it; otherwise push a `0` to `bulges` and treat as click.
- `handleCanvasMouseMove` — updates `currentPoint` (for preview) and, if `dragging` and past threshold, updates a live "preview bulge" that the overlay consumes.

**Bulge clamping during drag:** raw perpendicular distance is the signed projection of `(pointer - chordMidpoint)` onto the chord's left-normal unit vector. Clamp the magnitude to `chordLength / 2` so we never exceed a half-circle in v1. A snap-to-zero deadzone of `±2` px around the chord ensures small jitters commit as straight.

#### Drawing overlay update — `WallDrawingOverlay.tsx`

The preview now has to show two states:

- Normal (no drag active) — today's dashed straight line from last vertex to `currentPoint`.
- Drag active — replace the preview with an arc sampled from the committed-in-progress bulge. Reuse `wallPathData` on a `[lastX, lastY, currentX, currentY]` + `[liveBulge]` tuple. The existing dimension label (distance) continues to show the chord length in world units.

### Part D — Editing UX (midpoint handle)

New selection-time affordance. When `isSelected === true` and `activeTool === 'select'`, the canvas renders, per segment:

- Endpoint handle (existing pattern used by other element types — blue filled circle on each vertex, drags reposition that vertex).
- **Midpoint bulge handle** — green filled circle at `segmentMidpoint(seg)`. Dragging it:
  - Recomputes `bulges[i] = signed perpendicular offset of pointer from chord`.
  - Clamps magnitude to `chordLength / 2` (same clamp as drawing).
  - Snaps to zero inside `±2 px` deadzone, so users can "un-bend" a segment by dragging the handle back to the chord.
  - Commits on mouseup (single undo step via zundo).

#### New component: `src/components/editor/Canvas/WallEditOverlay.tsx`

Rendered when the selected element is a wall and the active tool is select. It reads the wall's `points` + `bulges`, draws endpoint handles and midpoint handles, and wires drag handlers that update the element in the store. It mounts/unmounts based on selection; walls that aren't selected don't pay any overlay cost.

#### Endpoint drag behavior

When an endpoint moves, adjacent `bulges[i]` values stay as-is — the arc radius updates automatically because it's derived from the chord + bulge distance. No special recomputation needed.

### Part E — Doors / windows on curved segments

Doors and windows use `parentWallId` + `positionOnWall: 0–1`. Today that resolves to a straight-segment position; the coordinate is interpreted against a straight polyline. We continue to interpret it against **only the straight segments** of a wall.

#### New helper in `src/lib/wallPath.ts`

```ts
/** Returns the segment index for a given parametric position on a wall,
 *  plus the parametric offset WITHIN that segment. Throws/returns null
 *  if positionOnWall lands on an arc segment. */
export function locateOnStraightSegments(
  points: number[],
  bulges: number[] | undefined,
  positionOnWall: number
): { segmentIndex: number; tInSegment: number } | null
```

Consumers that place doors/windows check the return value; if `null`, the door/window placement is rejected.

#### UI rejection cue

The door/window tools are present in `ToolSelector.tsx` but not yet fully wired as draggable elements in this codebase — so the bulk of this part is a **guard in `locateOnStraightSegments`** and a rule documented for any future door-placement code:

> A door/window's `positionOnWall` parameter addresses the concatenated *straight-segment* length of the wall. If a hit-test maps to an arc segment, the placement is rejected and, if drag-based, the drop shows a red-outline cue.

When door-drag UX lands (in a future bundle or later in this one if scope allows), it uses `locateOnStraightSegments`. If the result is `null`, render the door preview with a red outline and skip the commit.

### Part F — Store / undo

No store schema changes. `WallElement` updates flow through today's `updateElement(id, patch)` on `elementsStore`; zundo already snapshots each patch. Committing a bend (drag midpoint → mouseup) produces one undo step; committing a drawn wall with mixed segments produces one undo step (addElement). Mid-drag intermediate states are not committed to the store — they live in component state until mouseup.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         User interactions                             │
│   Draw: click / click-drag / dblclick     Edit: drag midpoint handle  │
└────────┬────────────────────────────────────────┬────────────────────┘
         │                                        │
         ▼                                        ▼
┌────────────────────────┐              ┌────────────────────────────┐
│   useWallDrawing.ts    │              │   WallEditOverlay.tsx      │
│   (hook state)         │              │   (selected-wall overlay)  │
│   - press/move/release │              │   - endpoint handles       │
│   - bulge tracking     │              │   - midpoint bulge handles │
└───────────┬────────────┘              └────────────┬───────────────┘
            │                                        │
            ▼                                        ▼
       addElement                              updateElement(id, patch)
            │                                        │
            └────────────┬───────────────────────────┘
                         ▼
              elementsStore (zundo)
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      wallPath.ts (pure)                               │
│   wallSegments · wallPathData · arcFromBulge · sampleArc ·            │
│   tangentAt · segmentMidpoint · locateOnStraightSegments              │
└──────────────────────────────────────────────────────────────────────┘
                         │
                         ▼
                 WallRenderer.tsx
              (Konva.Line if all-straight,
               Konva.Path if any bulge)
```

## Testing

All tests use the existing Vitest + React Testing Library setup.

### Unit — `src/lib/wallPath.test.ts` (new)

1. `wallSegments` with `bulges = undefined` returns straight segments for every pair.
2. `wallSegments` with a sparse `bulges` array pads missing entries as `0`.
3. `arcFromBulge` with `bulge === 0` returns `null`.
4. `arcFromBulge` with a positive bulge on a horizontal chord returns a center **above** the chord (screen coords) and the right radius (verify against a known pair: chord length 100, bulge 25 → radius 62.5).
5. `arcFromBulge` sign flip: negating the bulge flips the center to the other side of the chord and flips `sweep`.
6. `wallPathData` with all-zero bulges produces a path with only `M` and `L` commands (matches straight-line rendering).
7. `wallPathData` with one arc produces `M ... L ... A rx ry 0 0 sweep x y`.
8. `sampleArc` with `samples = 16` returns 16 points that are all within `0.1 px` of `radius` from the computed center.
9. `tangentAt(straightSeg, t)` returns the unit vector from start to end regardless of `t`.
10. `tangentAt(arcSeg, 0.5)` is perpendicular to the line from center to midpoint.
11. `segmentMidpoint(straightSeg)` equals chord midpoint.
12. `segmentMidpoint(arcSeg)` lies `|bulge|` px from the chord midpoint, perpendicular to the chord, on the correct side.
13. `locateOnStraightSegments` with all-straight wall returns the expected index for positions 0, 0.5, 1.
14. `locateOnStraightSegments` with a middle arc segment returns `null` for positions that fall within the arc's length.
15. `locateOnStraightSegments` with a middle arc segment returns a valid index for positions in the straight portions on either side.

### Unit — `src/hooks/useWallDrawing.test.ts` (new/updated cases)

16. mousedown + mouseup within `DRAG_THRESHOLD` commits a straight point (`bulges` push of `0`).
17. mousedown + move > threshold + mouseup commits the point **and** a non-zero bulge.
18. mousedown + move in the deadzone + mouseup commits as straight (deadzone snap).
19. mousedown + move beyond `chordLength / 2` + mouseup commits a clamped bulge of exactly `±chordLength / 2`.
20. Double-click commits a `WallElement` with matching `points.length / 2 - 1 === bulges.length`.
21. Canceling mid-draw clears both `points` and `bulges`.

### Component — `WallRenderer.test.tsx` (updated)

22. Wall with `bulges = undefined` renders `Konva.Line` (query by role/test-id).
23. Wall with all-zero `bulges` renders `Konva.Line` (fast path).
24. Wall with one non-zero bulge renders `Konva.Path` whose `data` prop contains an `A` command.
25. Wall selected state still changes stroke color regardless of straight/curved.

### Component — `WallEditOverlay.test.tsx` (new)

26. Mounted only when the selected element is a wall and tool is select.
27. Renders N endpoint handles and N-1 midpoint handles for an N-vertex wall.
28. Dragging a midpoint handle perpendicular to the chord calls `updateElement` with a patched `bulges[i]`.
29. Dragging a midpoint handle back through the chord snaps `bulges[i]` to `0`.
30. Dragging past `chordLength / 2` clamps the committed bulge.

### Integration — `CurvedWallFlow.test.tsx` (new)

31. Render editor → activate Wall tool → click, click-drag, click, double-click → resulting wall has `points.length === 8` and `bulges === [0, ≠0, 0]`.
32. Select the curved wall → drag its middle midpoint handle to the chord → `bulges[1]` becomes `0` → wall renders as a `Konva.Line`.
33. Undo after bending restores the previous `bulges`.

### Persistence — `autoSave.test.ts` (new cases)

34. Save + reload a wall with `bulges: [0, 10, 0]` → element round-trips identically.
35. Load a payload with a wall lacking the `bulges` field → element loads with `bulges === undefined` and renders as a `Konva.Line`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Existing saved walls break on load due to new field | Data loss | `bulges` is optional; renderer fast-paths `undefined`/all-zero to `Konva.Line`. Test 35 covers. |
| Click-drag swallows normal clicks (regression for today's drawing) | Existing users' muscle memory breaks | `DRAG_THRESHOLD = 4` px + deadzone snap to 0 — tests 16 & 18 pin the behavior. Under-threshold mouseup is bit-for-bit today's path. |
| Arc hit-testing fails on thin strokes | Users can't select curved walls | Use `hitStrokeWidth = max(12, thickness + 6)` on `Konva.Path`, same slack as the existing `Konva.Line` renderer (12). |
| Floating-point drift in `bulges` after many drags | Visual jitter or non-zero residue | Deadzone snap to `0`, and store rounds to 2 decimals on commit (mouseup) to keep diffs clean. |
| Doors placed via `positionOnWall` land on arc segments silently | Incorrect placement | `locateOnStraightSegments` returns `null` on arc hits; consumers must handle. Tests 14–15. |
| `Konva.Path` perf worse than `Konva.Line` for many short segments | Lag on heavy floorplans | Only switch to `Path` when any bulge is non-zero (test 22). All-straight walls keep today's renderer. |
| Bulge sign convention disagreement between drawing and editing UX | Bends go "the wrong way" | Single source of truth: the signed perpendicular projection onto the chord's left-normal, used in both `useWallDrawing` and `WallEditOverlay`. Tests 4–5 pin the math. |
| Half-circle clamp surprises power users | Minor UX papercut | Documented clamp (bulge ≤ chordLength/2); if users ask for full circles, we lift the clamp and switch the `large-arc` flag. Out of scope for v1. |

## Work Breakdown (for writing-plans)

1. `wallPath.ts` helpers + unit tests (tests 1–15).
2. `WallElement` type update (add optional `bulges?: number[]`).
3. `WallRenderer.tsx` — fast-path `Line` vs `Path` branch + tests 22–25.
4. `useWallDrawing.ts` — split press/move/release, add drag-to-bend + tests 16–21.
5. `WallDrawingOverlay.tsx` — arc preview while dragging.
6. Canvas wiring — route mousedown/move/up to the hook (hook previously only saw click).
7. `WallEditOverlay.tsx` — midpoint handle overlay + tests 26–30.
8. Canvas integration for the edit overlay (mount when selection includes a wall).
9. `locateOnStraightSegments` guard + document the contract for future door placement.
10. Integration test `CurvedWallFlow.test.tsx` (tests 31–33).
11. Persistence test cases (34–35).
12. Manual QA checklist against ship criteria 1–10.
13. Build size + lint report in PR description.
