/**
 * Helpers for attaching doors and windows to walls.
 *
 * Doors/windows store a `parentWallId` plus a parametric `positionOnWall`
 * in [0, 1] that refers to the concatenated length of the wall's STRAIGHT
 * segments only (arc segments are skipped — see `locateOnStraightSegments`
 * in wallPath.ts). These helpers find the nearest straight-segment point
 * to a canvas-space pointer and compute the corresponding parametric t so
 * downstream code can construct a DoorElement or WindowElement that sits
 * on the wall.
 */
import type { WallElement } from '../types/elements'
import { isWallElement } from '../types/elements'
import { wallSegments, type WallSegment } from './wallPath'

export interface WallHit {
  wall: WallElement
  /** Parametric position along the straight-segment concatenation, [0, 1]. */
  positionOnWall: number
  /** The world-space point on the wall closest to the pointer. */
  point: { x: number; y: number }
  /** The straight-segment the hit belongs to. */
  segmentIndex: number
  /** Local t within `segmentIndex`, [0, 1]. */
  tInSegment: number
  /** Distance in canvas units from pointer to the snapped point. */
  distance: number
}

/**
 * Closest point on segment (x0,y0)->(x1,y1) to (px,py), returned as
 * parametric t ∈ [0, 1] and the cartesian point.
 */
function closestPointOnStraightSegment(
  seg: WallSegment,
  px: number,
  py: number,
): { t: number; x: number; y: number; distance: number } {
  const dx = seg.x1 - seg.x0
  const dy = seg.y1 - seg.y0
  const len2 = dx * dx + dy * dy
  if (len2 === 0) {
    const d = Math.hypot(seg.x0 - px, seg.y0 - py)
    return { t: 0, x: seg.x0, y: seg.y0, distance: d }
  }
  let t = ((px - seg.x0) * dx + (py - seg.y0) * dy) / len2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const x = seg.x0 + dx * t
  const y = seg.y0 + dy * t
  return { t, x, y, distance: Math.hypot(x - px, y - py) }
}

/**
 * Given a pointer in canvas coords and a maximum snap distance, return the
 * nearest point on any wall's STRAIGHT segment. Doors and windows only
 * support straight segments in v1, so curved segments are skipped. Returns
 * null when no wall is close enough.
 */
export function findNearestStraightWallHit(
  elements: Record<string, { id: string; type: string }>,
  px: number,
  py: number,
  maxDistance: number,
): WallHit | null {
  let best: WallHit | null = null
  for (const el of Object.values(elements) as unknown as WallElement[]) {
    if (!isWallElement(el)) continue
    // Hidden walls are invisible in the canvas; snapping a door to one the
    // user can't see produces a dangling element. Locked walls remain
    // eligible — a locked wall is still visible and a valid anchor.
    if (el.visible === false) continue
    const segs = wallSegments(el.points, el.bulges)

    // Precompute the total STRAIGHT length so we can convert local
    // (segmentIndex, tInSegment) into a global positionOnWall.
    let totalStraight = 0
    for (const s of segs) {
      if (s.bulge === 0) totalStraight += Math.hypot(s.x1 - s.x0, s.y1 - s.y0)
    }
    if (totalStraight === 0) continue

    let cursor = 0
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]
      if (seg.bulge !== 0) continue
      const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0)
      const hit = closestPointOnStraightSegment(seg, px, py)
      if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) {
        const arcBefore = cursor
        const positionOnWall = totalStraight === 0 ? 0 : (arcBefore + hit.t * len) / totalStraight
        best = {
          wall: el,
          positionOnWall: Math.max(0, Math.min(1, positionOnWall)),
          point: { x: hit.x, y: hit.y },
          segmentIndex: i,
          tInSegment: hit.t,
          distance: hit.distance,
        }
      }
      cursor += len
    }
  }
  return best
}
