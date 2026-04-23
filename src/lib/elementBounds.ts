import { isWallElement, type CanvasElement } from '../types/elements'

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
 * exception — they live at (0, 0) with geometry baked into `points`. Handle
 * walls by scanning their points; everything else is a straightforward
 * `x ± width/2` expansion.
 *
 * Returns null for zero-size elements and for walls whose points array is
 * empty (shouldn't happen in practice, but the caller shouldn't have to
 * distinguish "missing" from "degenerate").
 */
export function elementBounds(el: CanvasElement): Bounds | null {
  if (isWallElement(el)) {
    if (el.points.length < 2) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < el.points.length; i += 2) {
      const px = el.points[i]
      const py = el.points[i + 1]
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
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
