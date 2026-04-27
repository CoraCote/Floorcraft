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
