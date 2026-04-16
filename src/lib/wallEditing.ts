/**
 * Wall-editing helpers used by WallEditOverlay handles. Extracted from the
 * component file so the component module only exports React components
 * (keeps react-refresh happy).
 */
import { useElementsStore } from '../stores/elementsStore'
import { isWallElement } from '../types/elements'
import { wallSegments } from './wallPath'

const BULGE_DEADZONE_PX = 2
const BULGE_ROUND_DECIMALS = 2

/**
 * Signed perpendicular offset from chord midpoint to pointer.
 * Uses the SAME left-normal convention as src/lib/wallPath.ts and
 * src/hooks/useWallDrawing.ts:
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

/** Move an endpoint vertex to the given pointer position. */
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
  store.updateElement(wallId, { points: nextPoints })
}
