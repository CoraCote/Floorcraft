import type { CanvasElement } from '../types/elements'
import { isWallElement } from '../types/elements'

/**
 * Compute the IDs of every element whose axis-aligned bounding box
 * intersects the given marquee rectangle in canvas-space coords.
 *
 * Selection rules:
 *   - Hidden elements (`visible === false`) are excluded.
 *   - Walls use their `points` array (center-origin x/y is 0 for walls).
 *   - Everything else is center-origin (x/y = element center, not top-left).
 *
 * Kept separate from `CanvasStage` so the intersection logic is unit-
 * testable without mounting a Konva stage.
 */
export function elementsIntersectingRect(
  elements: Record<string, CanvasElement>,
  rect: { x: number; y: number; w: number; h: number },
): string[] {
  const hits: string[] = []
  const rx1 = rect.x
  const ry1 = rect.y
  const rx2 = rect.x + rect.w
  const ry2 = rect.y + rect.h

  for (const el of Object.values(elements)) {
    if (el.visible === false) continue
    let minX: number
    let minY: number
    let maxX: number
    let maxY: number

    if (isWallElement(el)) {
      if (el.points.length < 2) continue
      minX = Infinity
      minY = Infinity
      maxX = -Infinity
      maxY = -Infinity
      for (let i = 0; i < el.points.length; i += 2) {
        const px = el.points[i]
        const py = el.points[i + 1]
        if (px < minX) minX = px
        if (py < minY) minY = py
        if (px > maxX) maxX = px
        if (py > maxY) maxY = py
      }
    } else {
      const halfW = el.width / 2
      const halfH = el.height / 2
      minX = el.x - halfW
      minY = el.y - halfH
      maxX = el.x + halfW
      maxY = el.y + halfH
    }

    if (maxX >= rx1 && minX <= rx2 && maxY >= ry1 && minY <= ry2) {
      hits.push(el.id)
    }
  }
  return hits
}
