import type {
  DeskElement,
  WorkstationElement,
  PrivateOfficeElement,
} from '../types/elements'
import type { Employee } from '../types/employee'

/**
 * Equipment-needs overlay (Feature C6).
 *
 * Pure helpers for the "does this desk have what its seated employee needs?"
 * read-only view. Kept deliberately decoupled from Konva/Zustand so the
 * logic is trivially unit-testable and can be reused from insight
 * narratives or CSV reports later if we want.
 *
 * Status semantics (one desk + one employee):
 *   - `ok`      every one of the employee's `equipmentNeeds` is present in
 *               the desk's `equipment` (the employee's needs are a subset
 *               of the desk's equipment).
 *   - `partial` at least one need matches AND at least one is missing.
 *   - `missing` the employee has ≥1 needs AND none of them match.
 *   - `na`      "not applicable" — either the desk is unassigned or the
 *               seated employee has an empty `equipmentNeeds` array. The
 *               overlay renders nothing for this case.
 *
 * Matching is case-insensitive and trims whitespace, because equipment
 * tags come from free-form user input (CSV imports, roster edits) where
 * `"Monitor "` vs `"monitor"` is almost certainly the same thing. If this
 * becomes too permissive later we can tighten the comparator — but
 * silently marking a correctly-equipped desk as `partial` because of a
 * trailing space would be strictly worse UX.
 */

export type DeskEquipmentStatus = 'ok' | 'partial' | 'missing' | 'na'

/** Any of the three seat-bearing element types carry an optional
 * `equipment` field. The overlay treats them identically — the only
 * property we read is `equipment`, and the caller decides "who is
 * seated" upstream. */
export type EquippableDesk =
  | DeskElement
  | WorkstationElement
  | PrivateOfficeElement

function normalize(tag: string): string {
  return tag.trim().toLowerCase()
}

/**
 * Compute the equipment-match status for a desk + the employee seated at
 * it. Pass `employee = null` when the desk is unassigned — the function
 * short-circuits to `'na'`.
 *
 * The function is intentionally tolerant of absent fields:
 *   - `desk.equipment === undefined` is treated as `[]` (no equipment).
 *   - `employee.equipmentNeeds === undefined` is treated as `[]` (no
 *     needs) — normally the Employee type guarantees the field, but we
 *     don't want the overlay to explode on a freshly-imported row that
 *     somehow slipped past validation.
 */
export function computeDeskEquipmentStatus(
  desk: EquippableDesk,
  employee: Employee | null,
): DeskEquipmentStatus {
  if (!employee) return 'na'
  const needs = employee.equipmentNeeds ?? []
  if (needs.length === 0) return 'na'

  const deskEquip = desk.equipment ?? []
  const haveSet = new Set(deskEquip.map(normalize))

  let matched = 0
  for (const need of needs) {
    if (haveSet.has(normalize(need))) matched++
  }

  if (matched === needs.length) return 'ok'
  if (matched === 0) return 'missing'
  return 'partial'
}

/**
 * Tailwind-friendly RGBA-ish colors keyed by status. Returned as strings
 * (not palette tokens) so the Konva layer can feed them directly into a
 * Rect's `fill` without a second lookup. Opacities are tuned low so the
 * overlay reads as a tint rather than an opaque paint — the underlying
 * desk renderer stays legible beneath it.
 *
 * `na` returns transparent — the overlay layer is expected to skip these
 * rects entirely for zero overdraw, but the function returns a valid
 * string so destructuring callers don't need a branch.
 */
export function statusColor(status: DeskEquipmentStatus): string {
  switch (status) {
    case 'ok':
      return 'rgba(16, 185, 129, 0.35)' // emerald-500 @ 35%
    case 'partial':
      return 'rgba(245, 158, 11, 0.35)' // amber-500 @ 35%
    case 'missing':
      return 'rgba(239, 68, 68, 0.40)' // red-500 @ 40%
    case 'na':
      return 'rgba(0, 0, 0, 0)'
  }
}
