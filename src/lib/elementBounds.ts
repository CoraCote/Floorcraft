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
  const rotation = el.rotation ?? 0
  if (rotation === 0) {
    return {
      x: el.x - w / 2,
      y: el.y - h / 2,
      width: w,
      height: h,
    }
  }
  // Rotate the four center-origin corners around (el.x, el.y) and take the
  // AABB of the rotated quad. Without this a 45° desk reports its
  // unrotated box, so marquee selection, fit-to-screen, and the union
  // AABB all clip the corners that visually poke outside.
  const halfW = w / 2
  const halfH = h / 2
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  // Iterate the four center-origin corners (TL, TR, BR, BL) and rotate
  // each around (el.x, el.y). Bias the index→signs mapping with bitwise
  // selectors so the loop body stays branch-free in the hot path —
  // marquee selection calls this on every element on every mousemove.
  for (let i = 0; i < 4; i++) {
    const cx = i === 1 || i === 2 ? halfW : -halfW
    const cy = i < 2 ? -halfH : halfH
    const rx = cx * cos - cy * sin + el.x
    const ry = cx * sin + cy * cos + el.y
    if (rx < minX) minX = rx
    if (ry < minY) minY = ry
    if (rx > maxX) maxX = rx
    if (ry > maxY) maxY = ry
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
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
