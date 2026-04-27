/**
 * Wall-editing helpers used by WallEditOverlay handles. Extracted from the
 * component file so the component module only exports React components
 * (keeps react-refresh happy).
 */
import { useElementsStore } from '../stores/elementsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { isWallElement } from '../types/elements'
import { wallSegments } from './wallPath'
import { findNearestWallVertex } from './wallAttachment'
import { ENDPOINT_SNAP_PX, lockToCardinal } from './wallSnap'

export const BULGE_DEADZONE_PX = 2
export const BULGE_ROUND_DECIMALS = 2

/**
 * Signed perpendicular offset from chord midpoint to pointer.
 * Uses the SAME left-normal convention as src/lib/wallPath.ts:
 *   lnx = dy/c, lny = -dx/c   (screen coords, y grows downward)
 * Positive result = pointer is VISUALLY above a left-to-right chord,
 * matching how wallPath.ts renders positive bulges.
 */
export function signedPerpOffset(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  px: number,
  py: number,
): number {
  const dx = x1 - x0
  const dy = y1 - y0
  const c = Math.hypot(dx, dy)
  if (c === 0) return 0
  const lnx = dy / c
  const lny = -dx / c
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  return (px - mx) * lnx + (py - my) * lny
}

/**
 * Apply deadzone + half-chord clamp + rounding to a raw perp offset.
 * Shared by the drawing hook (live preview) and the edit overlay
 * (midpoint-handle drag) so sign/clamp/rounding can never drift.
 */
export function clampBulge(raw: number, chordLen: number): number {
  if (Math.abs(raw) < BULGE_DEADZONE_PX) return 0
  const max = chordLen / 2
  const clamped = Math.max(-max, Math.min(max, raw))
  const factor = 10 ** BULGE_ROUND_DECIMALS
  return Math.round(clamped * factor) / factor
}

/** Apply the bulge implied by a pointer position during a midpoint-handle drag. */
export function applyBulgeFromDrag(
  wallId: string,
  segmentIndex: number,
  pointer: { x: number; y: number },
): void {
  const store = useElementsStore.getState()
  const el = store.elements[wallId]
  if (!el || !isWallElement(el)) return
  const segs = wallSegments(el.points, el.bulges)
  const seg = segs[segmentIndex]
  if (!seg) return
  const chord = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0)
  const raw = signedPerpOffset(seg.x0, seg.y0, seg.x1, seg.y1, pointer.x, pointer.y)
  const newBulge = clampBulge(raw, chord)
  const nextBulges = Array.from(
    { length: segs.length },
    (_, i) => el.bulges?.[i] ?? 0,
  )
  nextBulges[segmentIndex] = newBulge
  store.updateElement(wallId, { bulges: nextBulges })
}

/**
 * Move an endpoint vertex to the given pointer position AND re-clamp the
 * bulges of the segments that touch it. Moving a vertex changes the chord
 * length of the 0, 1, or 2 adjacent segments; a bulge set while the chord
 * was long can exceed chord/2 after the chord shortens and produce a wrong
 * or degenerate arc. We clamp those bulges back into the legal range here
 * so the arc always stays a valid circular segment (|bulge| ≤ chord/2).
 *
 * We do NOT touch non-adjacent segments — their chord didn't change.
 */
export function applyVertexMove(
  wallId: string,
  vertexIndex: number,
  pointer: { x: number; y: number },
  options: { shiftKey?: boolean } = {},
): void {
  const store = useElementsStore.getState()
  const el = store.elements[wallId]
  if (!el || !isWallElement(el)) return

  // Snap precedence at the dragged vertex matches the drawing tool:
  //   1. Cardinal lock (Shift held) — relative to the adjacent vertex
  //      (the one before this vertex in `points[]`, falling back to the
  //      one after if the user is dragging the very first vertex).
  //   2. Endpoint snap — to any other wall's vertex within
  //      `ENDPOINT_SNAP_PX / stageScale` canvas units. Excludes vertices
  //      on the wall being edited so we never snap a vertex onto its
  //      own neighbour and collapse the segment.
  let px = pointer.x
  let py = pointer.y

  if (options.shiftKey) {
    const adjacentIdx = vertexIndex > 0 ? vertexIndex - 1 : 1
    if (adjacentIdx * 2 + 1 < el.points.length) {
      const ax = el.points[adjacentIdx * 2]
      const ay = el.points[adjacentIdx * 2 + 1]
      const locked = lockToCardinal(ax, ay, px, py)
      px = locked.x
      py = locked.y
    }
  }

  const stageScale = useCanvasStore.getState().stageScale || 1
  const radius = ENDPOINT_SNAP_PX / stageScale
  const hit = findNearestWallVertex(store.elements, px, py, radius, {
    excludeWallId: wallId,
  })
  if (hit) {
    px = hit.x
    py = hit.y
  }

  const nextPoints = [...el.points]
  nextPoints[vertexIndex * 2] = px
  nextPoints[vertexIndex * 2 + 1] = py

  // Vertex v touches at most two segments: [v-1 -> v] as seg (v-1) and
  // [v -> v+1] as seg v. Skip bulge work when the wall has no bulges array
  // (pre-migration walls) or no bulges touching this vertex.
  const segmentCount = nextPoints.length / 2 - 1
  const existingBulges = el.bulges ?? []
  const nextBulges: number[] = Array.from({ length: segmentCount }, (_, i) =>
    Number.isFinite(existingBulges[i]) ? existingBulges[i] : 0,
  )

  const reclampAt = (segIdx: number) => {
    if (segIdx < 0 || segIdx >= segmentCount) return
    const b = nextBulges[segIdx]
    if (!b) return // nothing to re-clamp; 0 stays 0.
    const x0 = nextPoints[segIdx * 2]
    const y0 = nextPoints[segIdx * 2 + 1]
    const x1 = nextPoints[segIdx * 2 + 2]
    const y1 = nextPoints[segIdx * 2 + 3]
    const chord = Math.hypot(x1 - x0, y1 - y0)
    nextBulges[segIdx] = clampBulge(b, chord)
  }

  reclampAt(vertexIndex - 1)
  reclampAt(vertexIndex)

  store.updateElement(wallId, { points: nextPoints, bulges: nextBulges })
}

/**
 * Translate every vertex of a wall by (dx, dy). Used by the body-drag path
 * in ElementRenderer: walls are rendered with their wrapping <Group> at
 * (0, 0) and the geometry baked into `points[]`, so dragging the Group
 * delivers a (dx, dy) delta on dragEnd that must be applied to every point
 * — writing `{x, y}` to the element does nothing because the renderer
 * ignores those fields for walls (the `ownsPosition` contract).
 *
 * Doors and windows attached via `parentWallId` follow automatically:
 * their world position is resolved from the parent wall's `points`, so a
 * uniform translation of all wall vertices moves the resolved world point
 * by the same delta (`positionOnWall` is parametric and unchanged).
 *
 * Bulges are not touched: the chord lengths between consecutive vertices
 * are preserved by a rigid translation, so `|bulge| ≤ chord/2` still holds.
 */
export function translateWall(wallId: string, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  const store = useElementsStore.getState()
  const el = store.elements[wallId]
  if (!el || !isWallElement(el)) return
  const nextPoints = new Array<number>(el.points.length)
  for (let i = 0; i < el.points.length; i++) {
    nextPoints[i] = el.points[i] + (i % 2 === 0 ? dx : dy)
  }
  store.updateElement(wallId, { points: nextPoints })
}
