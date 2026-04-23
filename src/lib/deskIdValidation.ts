import { isAssignableElement, type CanvasElement } from '../types/elements'

/**
 * Validates a desk id against the rest of the floor.
 *
 * Rules (driven by onboarding data where one customer hit import failures
 * because two desks on the same floor had id "12"):
 *   1. Must be non-empty after trim.
 *   2. Must be unique among assignable elements (desk / hot-desk /
 *      workstation / private-office) on the *same floor*.
 *   3. Comparison is case- and whitespace-insensitive so "D-1" and " d-1 "
 *      collide — humans typing in the UI wouldn't distinguish them.
 *
 * Desk ids are scoped per floor because the roster references a seat by
 * `{floorId, elementId}`, not by desk id. Making ids globally unique would
 * force customers with "Desk 1" on every floor to renumber unnecessarily.
 *
 * Returns `null` when valid; a human-readable error string otherwise.
 */
export function validateDeskId(
  candidate: string,
  elementId: string,
  elements: Record<string, CanvasElement>,
): string | null {
  const trimmed = candidate.trim()
  if (trimmed === '') return 'Desk ID is required'

  const subject = elements[elementId]
  if (!subject || !isAssignableElement(subject)) {
    // The subject must exist and be an assignable element for collision
    // checks to make sense. If the caller passes a bogus element id just
    // fall back to "no collision" — the caller's error is orthogonal.
    return null
  }

  // `elements` is always scoped to a single floor (the elementsStore only
  // holds the active floor's elements at any moment). The per-floor contract
  // is enforced by the caller, not by a field on the element.
  void subject
  const normalized = trimmed.toLowerCase()
  for (const [otherId, other] of Object.entries(elements)) {
    if (otherId === elementId) continue
    if (!isAssignableElement(other)) continue
    if (other.deskId.trim().toLowerCase() === normalized) {
      return `Desk ID "${trimmed}" is already used on this floor`
    }
  }
  return null
}
