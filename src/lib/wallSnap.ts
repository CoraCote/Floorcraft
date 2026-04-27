/**
 * Shared snap helpers for the wall tool.
 *
 * - Endpoint snap: while drawing or dragging a vertex, prefer landing on
 *   an existing wall's vertex over a grid intersection. The radius is
 *   measured in screen pixels (canvas units divided by `stageScale`) so
 *   the snap feels the same regardless of zoom level — at 4× zoom a
 *   12-screen-pixel radius is 3 canvas units, at 0.5× zoom it's 24.
 *
 * - Cardinal lock: when Shift is held, project a candidate point onto
 *   the nearest of 0° / 45° / 90° / 135° from a fixed anchor. Used by
 *   the wall draw tool's preview + commit and by the vertex-drag
 *   handler. Cardinal lock runs BEFORE grid snap so the user always sees
 *   a clean axis-aligned segment regardless of the grid.
 */

/** Endpoint snap radius in **screen pixels**. Caller divides by stageScale
 *  to convert to canvas units. */
export const ENDPOINT_SNAP_PX = 10

/**
 * Snap radius in **screen pixels** for the "add vertex on edge" hover
 * indicator. The cursor must be within this many screen pixels of the
 * polyline (measured perpendicular-from-cursor to the closest segment) for
 * the indicator to render. Tighter than the endpoint snap so the indicator
 * doesn't fight the existing endpoint-handle dragging affordance — the
 * endpoint snap wins inside its own radius and the edge indicator only
 * appears in the band where the cursor is *near the edge but not near a
 * vertex.* Caller divides by stageScale to get canvas units.
 */
export const EDGE_SNAP_PX = 6

import type { WallSegment } from './wallPath'

/**
 * Project a pointer onto the closest point of a wall's polyline. Returns
 * the projected canvas-space point, the index of the segment it lies on,
 * the parametric position `t ∈ [0, 1]` along that segment, and the
 * straight-line distance from the pointer to that projected point.
 *
 * Notes:
 *   - Curved (bulged) segments are projected against their **chord**, not
 *     the arc. Splitting an arc by chord-projection still produces two
 *     valid sub-arcs with appropriate halved bulges, and the chord
 *     projection is fast and stable; arc-foot computation would require
 *     iterative geometry that's overkill for an interactive hover hint.
 *     The split point we return is the chord projection, not the arc
 *     foot — when the new vertex is committed it sits on the chord
 *     position and the two new sub-segments inherit halved bulges so the
 *     arc geometry visibly continues through it. Users can then drag
 *     the new vertex to fine-tune.
 *   - Returns null when the wall has no segments (`points.length < 4`)
 *     or every segment has zero length (degenerate wall).
 */
export function findNearestPointOnWallEdge(
  segments: WallSegment[],
  px: number,
  py: number,
): {
  segmentIndex: number
  t: number
  x: number
  y: number
  distance: number
} | null {
  let best: {
    segmentIndex: number
    t: number
    x: number
    y: number
    distance: number
  } | null = null
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const dx = seg.x1 - seg.x0
    const dy = seg.y1 - seg.y0
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) continue
    // Foot of perpendicular from (px, py) onto chord, clamped to [0, 1].
    let t = ((px - seg.x0) * dx + (py - seg.y0) * dy) / lenSq
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const fx = seg.x0 + dx * t
    const fy = seg.y0 + dy * t
    const ddx = px - fx
    const ddy = py - fy
    const dist = Math.hypot(ddx, ddy)
    if (!best || dist < best.distance) {
      best = { segmentIndex: i, t, x: fx, y: fy, distance: dist }
    }
  }
  return best
}

/**
 * Project (px, py) onto the nearest of 8 rays from (ax, ay) at multiples
 * of 45°. Picks the projection (perpendicular foot on the chosen ray)
 * — not the intersection on the cardinal grid — so the segment length
 * matches the user's intended drag magnitude as closely as possible
 * while only the angle is constrained.
 */
export function lockToCardinal(
  ax: number,
  ay: number,
  px: number,
  py: number,
): { x: number; y: number } {
  const dx = px - ax
  const dy = py - ay
  if (dx === 0 && dy === 0) return { x: px, y: py }
  // Round to nearest 45° step. Angle in radians from +x axis.
  const angle = Math.atan2(dy, dx)
  const step = Math.PI / 4
  const snappedAngle = Math.round(angle / step) * step
  const dist = Math.hypot(dx, dy)
  return {
    x: ax + Math.cos(snappedAngle) * dist,
    y: ay + Math.sin(snappedAngle) * dist,
  }
}
