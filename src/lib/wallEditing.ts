/**
 * Wall-editing helpers used by WallEditOverlay handles. Extracted from the
 * component file so the component module only exports React components
 * (keeps react-refresh happy).
 */
import { useElementsStore } from '../stores/elementsStore'
import { isWallElement } from '../types/elements'
import { wallSegments } from './wallPath'

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
): void {
  const store = useElementsStore.getState()
  const el = store.elements[wallId]
  if (!el || !isWallElement(el)) return

  const nextPoints = [...el.points]
  nextPoints[vertexIndex * 2] = pointer.x
  nextPoints[vertexIndex * 2 + 1] = pointer.y

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
