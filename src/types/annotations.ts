/**
 * Element annotations — sticky notes pinned to the canvas.
 *
 * Two anchor shapes:
 *   - `element`: pinned to a canvas element (follows the element as it
 *     moves; the renderer reads the element's current position so we
 *     don't have to update the annotation on every drag).
 *   - `floor-position`: absolute canvas coords on a specific floor. Used
 *     when the note isn't about a specific element — e.g. "move this
 *     corner after Q3 remodel".
 *
 * Bodies are capped at 280 chars. We don't store a real author id yet —
 * the roster/auth mapping isn't hooked up to the annotations path — so we
 * snapshot a display name at create time ("jane.doe" derived from the
 * email prefix). That's enough provenance for the open-workflow UX.
 */
export const ANNOTATION_BODY_MAX = 280

export interface ElementAnnotationAnchor {
  type: 'element'
  elementId: string
}

export interface FloorPositionAnnotationAnchor {
  type: 'floor-position'
  floorId: string
  x: number
  y: number
}

export type AnnotationAnchor =
  | ElementAnnotationAnchor
  | FloorPositionAnnotationAnchor

export interface Annotation {
  id: string
  /** <= 280 chars. UI trims before storing; the renderer truncates further for display. */
  body: string
  /** Display name captured at creation time — we don't store user ids yet. */
  authorName: string
  /** ISO timestamp. */
  createdAt: string
  /** ISO timestamp once resolved, or null while the note is open. */
  resolvedAt: string | null
  anchor: AnnotationAnchor
}

export function isElementAnchor(
  anchor: AnnotationAnchor,
): anchor is ElementAnnotationAnchor {
  return anchor.type === 'element'
}

export function isFloorPositionAnchor(
  anchor: AnnotationAnchor,
): anchor is FloorPositionAnnotationAnchor {
  return anchor.type === 'floor-position'
}
