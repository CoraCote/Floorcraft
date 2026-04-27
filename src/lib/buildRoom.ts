/**
 * Build the four wall elements that make up a rectangular room (Fix 2 of
 * the P1 wall-drawing improvements).
 *
 * The rectangle/room tool drags from corner A to corner B and, on release,
 * commits a closed rectangle as four `WallElement`s in a single undo
 * batch. This module is the pure helper that turns two corner points into
 * the four wall payloads — separated from the React layer (CanvasStage's
 * `handleMouseUp`) so the construction is unit-testable without mounting
 * Konva or the canvas store.
 *
 * Why four walls instead of one closed polyline? Three reasons:
 *
 *   1. **Door/window attachability.** Doors and windows attach to a
 *      single straight wall via `parentWallId` + `positionOnWall`. A
 *      one-piece closed wall would force `positionOnWall` to span four
 *      sides of the room, which makes the slider math meaningless. Four
 *      walls give the user one "side" per attachable surface.
 *
 *   2. **Per-side editing.** Users frequently want to edit one side of
 *      a room without touching the others (move the south wall to make
 *      the room narrower, swap one side to glass, etc.). Having four
 *      independent walls is the natural data shape for that.
 *
 *   3. **Cascade-delete locality.** If the user deletes one wall of the
 *      room, only its attached doors/windows cascade — not every
 *      door/window in the room. Matches the architectural mental model
 *      "the south wall is gone; the north wall is still here."
 *
 * The helper does NOT add the elements to the store — the caller does
 * that via `addElements`, which records a single zundo snapshot so
 * undoing rolls back the whole rectangle.
 */

import { nanoid } from 'nanoid'
import type { WallElement } from '../types/elements'

/**
 * Default visual style for newly-constructed room walls. Matches the
 * style baked into `useWallDrawing.handleCanvasDoubleClick` so a
 * rectangle drawn via this tool is visually indistinguishable from one
 * drawn segment-by-segment with the wall tool. Kept module-local rather
 * than imported from `useWallDrawing` because that hook is React-state-
 * heavy and pulling its style block out for shared use would force a
 * larger refactor than warranted.
 */
const ROOM_WALL_STYLE: WallElement['style'] = {
  fill: '#1F2937',
  stroke: '#111827',
  strokeWidth: 6,
  opacity: 1,
}
const ROOM_WALL_THICKNESS = 6

export interface RoomCorners {
  ax: number
  ay: number
  bx: number
  by: number
}

/**
 * Build four `WallElement`s from two corner points. The walls are
 * connected end-to-end:
 *
 *   top:    (ax, ay) → (bx, ay)
 *   right:  (bx, ay) → (bx, by)
 *   bottom: (bx, by) → (ax, by)
 *   left:   (ax, by) → (ax, ay)
 *
 * Order is meaningful — z-index increments by one per wall starting from
 * `baseZIndex`, so the rendered z-stack is stable and reproducible.
 *
 * Empty (zero-area) and degenerate (one-axis-zero) inputs return an
 * empty array. The caller is expected to check that the user actually
 * dragged before calling this — but we double-check here so we never
 * commit a four-wall ghost-room with overlapping segments.
 *
 * Note: corners are taken at face value — the caller decides whether to
 * normalise (min/max) or pass A and B as the user clicked them. Both
 * produce a closed rectangle with the same four edges; the only
 * observable difference is which corner each wall is "labelled" as
 * starting from. We preserve A→B order because tests sometimes care
 * about the directional sense of each segment for assertions about
 * `points[]` ordering.
 */
export function buildRoomWalls(
  corners: RoomCorners,
  baseZIndex: number,
): WallElement[] {
  const { ax, ay, bx, by } = corners
  const w = bx - ax
  const h = by - ay
  // A zero-area drag is "I clicked but didn't drag" — emit nothing so
  // the click doesn't silently spawn an invisible four-wall stack.
  if (w === 0 || h === 0) return []

  const walls: Array<{ label: string; points: number[] }> = [
    { label: 'Wall (top)',    points: [ax, ay, bx, ay] },
    { label: 'Wall (right)',  points: [bx, ay, bx, by] },
    { label: 'Wall (bottom)', points: [bx, by, ax, by] },
    { label: 'Wall (left)',   points: [ax, by, ax, ay] },
  ]

  return walls.map((spec, i) => ({
    id: nanoid(),
    type: 'wall' as const,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: baseZIndex + i,
    label: spec.label,
    visible: true,
    style: ROOM_WALL_STYLE,
    points: spec.points,
    bulges: [0],
    thickness: ROOM_WALL_THICKNESS,
    wallType: 'solid' as const,
  }))
}

/**
 * Apply the cardinal-lock-style "make it a square" constraint when Shift
 * is held during a rectangle drag. We pick the shorter of the two raw
 * dimensions and use it for both — so a (300 × 100) drag becomes (100
 * × 100). The "shorter wins" rule is consistent with the user's drag
 * gesture: their cursor never travelled the longer distance, so
 * snapping the longer side back to match the shorter one keeps the
 * rectangle inside the visible drag rectangle.
 *
 * The sign of each axis is preserved so dragging up-and-to-the-left
 * still produces a rectangle anchored at the start corner (rather than
 * teleporting to the down-right quadrant). When one axis is zero the
 * helper returns the input untouched — there's no square to snap to,
 * and the caller is expected to filter zero-area drags before commit.
 */
export function squareConstrain(corners: RoomCorners): RoomCorners {
  const { ax, ay, bx, by } = corners
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 || dy === 0) return corners
  const size = Math.min(Math.abs(dx), Math.abs(dy))
  const sx = dx >= 0 ? 1 : -1
  const sy = dy >= 0 ? 1 : -1
  return {
    ax,
    ay,
    bx: ax + sx * size,
    by: ay + sy * size,
  }
}
