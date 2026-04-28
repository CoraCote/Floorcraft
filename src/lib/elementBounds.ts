import { isWallElement, type CanvasElement } from '../types/elements'
import { segmentBounds, wallSegments } from './wallPath'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Axis-aligned bounding box for a single element in world coordinates.
 *
 * Most elements use center-origin x/y with width/height, but walls are the
 * exception — they live at (0, 0) with geometry baked into `points` plus
 * an optional `bulges` array. For each segment we expand the bounds by
 * the segment's exact AABB (`segmentBounds`), which considers arc
 * extrema for curved walls and the chord endpoints for straight ones.
 * Without the arc-aware path, a wall that bulges out to round a corner
 * would report its chord rectangle and lose the curved portion in
 * marquee picks, fit-to-screen, and the floor's union AABB.
 *
 * Returns null for zero-size elements and for walls whose points array is
 * empty (shouldn't happen in practice, but the caller shouldn't have to
 * distinguish "missing" from "degenerate").
 */
export function elementBounds(el: CanvasElement): Bounds | null {
  if (isWallElement(el)) {
    if (el.points.length < 2) return null
    if (el.points.length < 4) {
      // Degenerate single-vertex "wall" — nothing has dimension. Surface
      // it as the point itself so callers that need a place to anchor
      // (e.g. select pulse) still get coordinates.
      return { x: el.points[0], y: el.points[1], width: 0, height: 0 }
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const seg of wallSegments(el.points, el.bulges)) {
      const b = segmentBounds(seg)
      if (b.minX < minX) minX = b.minX
      if (b.minY < minY) minY = b.minY
      if (b.maxX > maxX) maxX = b.maxX
      if (b.maxY > maxY) maxY = b.maxY
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }
  const w = el.width ?? 0
  const h = el.height ?? 0
  return {
    x: el.x - w / 2,
    y: el.y - h / 2,
    width: w,
    height: h,
  }
}

/**
 * Union AABB of the given elements. Returns null when the list is empty or
 * every element collapses to nothing.
 *
 * Padding (world units) inflates the box on every side — useful when the
 * caller wants the viewport to show some context around the elements rather
 * than hugging them tightly.
 */
export function unionBounds(
  elements: CanvasElement[],
  padding = 0,
): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let any = false

  for (const el of elements) {
    const b = elementBounds(el)
    if (!b) continue
    any = true
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.width > maxX) maxX = b.x + b.width
    if (b.y + b.height > maxY) maxY = b.y + b.height
  }

  if (!any) return null
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}
