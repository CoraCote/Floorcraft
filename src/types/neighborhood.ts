/**
 * A neighborhood is a labeled rectangle on the canvas that visually tints
 * a region and semantically groups the seats inside it. Unlike walls,
 * neighborhoods do not affect geometry — they are a pure organizational
 * overlay for facilities managers and HR to call out "Engineering Pod A",
 * "Design Studio", "Sales Row", etc.
 *
 * Axis-aligned only (no rotation) — the rectangle is always rendered
 * with its sides parallel to the world axes so containment tests stay a
 * simple AABB check. `x`, `y` are canvas-space center coordinates to
 * match the convention used by every other element in `CanvasElement`.
 */
export interface Neighborhood {
  id: string
  name: string
  /** Hex color (#rrggbb). Rendered as a 15%-alpha fill on the canvas. */
  color: string
  /** Center x, in canvas units. */
  x: number
  /** Center y, in canvas units. */
  y: number
  width: number
  height: number
  floorId: string
  // Optional semantic metadata. Kept nullable (rather than omitted) so
  // the payload shape is consistent whether the user filled it in or not,
  // which simplifies autosave round-trips and analyzer guards.
  department?: string | null
  team?: string | null
  notes?: string | null
}

/** Small curated palette offered when the user creates a new neighborhood. */
export const NEIGHBORHOOD_PALETTE: readonly string[] = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#64748B', // slate
] as const
