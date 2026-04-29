import type { CanvasElement } from '../types/elements'
import { elementBounds } from './elementBounds'

/**
 * Compute the IDs of every element whose axis-aligned bounding box
 * intersects the given marquee rectangle in canvas-space coords.
 *
 * Selection rules:
 *   - Hidden elements (`visible === false`) are excluded.
 *   - Bounds come from `elementBounds`, which is bulge-aware for walls and
 *     rotation-aware for everything else. Keeping the AABB calculation in
 *     one place means selection, fit-to-screen, and the union AABB all see
 *     the same shape — a wall whose bulge sits outside the chord rectangle,
 *     or a 45° rotated desk whose corners poke beyond its unrotated box,
 *     gets picked when the marquee visibly covers it.
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
    const b = elementBounds(el)
    if (!b) continue
    if (
      b.x + b.width >= rx1 &&
      b.x <= rx2 &&
      b.y + b.height >= ry1 &&
      b.y <= ry2
    ) {
      hits.push(el.id)
    }
  }
  return hits
}
