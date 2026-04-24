import type { CanvasElement } from '../types/elements'
import type { Neighborhood } from '../types/neighborhood'

/**
 * Axis-aligned rectangle overlap between an element's AABB and a
 * neighborhood's bounds. Both use center-origin coordinates so the math
 * is symmetric.
 *
 * "Inside" here is defined as any overlap — even a partial one — because
 * a seat that straddles the boundary of "Engineering Pod A" is still
 * visually inside the pod and facilities managers expect it to be
 * counted. A strict containment check would surprise users who resize a
 * zone to clip a seat by a pixel and then see the headcount drop.
 *
 * Rotation on the element is ignored by design: for the insights use case
 * (headcount inside a named zone), treating every element as its
 * axis-aligned bounding box is a standard, well-understood simplification
 * — and it keeps `runAllAnalyzers` cheap.
 */
export function elementInNeighborhood(
  element: CanvasElement,
  neighborhood: Neighborhood,
): boolean {
  // Skip neighborhoods from other floors entirely. Elements don't carry
  // a floorId (the floor owns them via `floorStore.floors[*].elements`),
  // so the caller is responsible for not passing cross-floor pairs in
  // the first place — but we still guard per-element via width/height
  // below because a 0-size element can't sensibly "overlap" anything.
  if (element.width <= 0 || element.height <= 0) return false

  const elHalfW = element.width / 2
  const elHalfH = element.height / 2
  const elLeft = element.x - elHalfW
  const elRight = element.x + elHalfW
  const elTop = element.y - elHalfH
  const elBottom = element.y + elHalfH

  const nHalfW = neighborhood.width / 2
  const nHalfH = neighborhood.height / 2
  const nLeft = neighborhood.x - nHalfW
  const nRight = neighborhood.x + nHalfW
  const nTop = neighborhood.y - nHalfH
  const nBottom = neighborhood.y + nHalfH

  // Classic AABB overlap test. The `<=` / `>=` inclusive comparison
  // means an element whose edge exactly touches the neighborhood edge
  // counts as inside — consistent with the "straddling = inside" rule.
  return elLeft <= nRight && elRight >= nLeft && elTop <= nBottom && elBottom >= nTop
}

/**
 * Filter a list (or map) of elements down to those overlapping the
 * neighborhood. Accepts either an array or a `Record<string, Element>`
 * so callers can pass the raw `elementsStore.elements` map without a
 * `.values()` dance.
 */
export function getElementsInNeighborhood(
  elements: CanvasElement[] | Record<string, CanvasElement>,
  neighborhood: Neighborhood,
): CanvasElement[] {
  const arr = Array.isArray(elements) ? elements : Object.values(elements)
  return arr.filter((el) => elementInNeighborhood(el, neighborhood))
}
