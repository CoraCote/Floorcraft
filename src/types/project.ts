import type { Floor } from './floor'
import type { LengthUnit } from '../lib/units'

/**
 * Cosmetic style for the per-seat employee label painted inside desks,
 * workstation slots, and private offices.
 *
 * Wave 16 — full rework. The previous four styles each encoded the same
 * datum two or three times (department text + department colour stripe +
 * department-coloured border on the same seat; initials chip rendered
 * RIGHT next to the same person's full name; deskId in the corner of
 * every desk while it was already in the hover card and Properties panel).
 * The fundamental fix is *one encoding per datum*. The canvas labels are
 * glanceable identity only; rich employee data lives in the hover card.
 *
 *   - `'pill'`   — Department-tinted pill, full name in bold. Tint IS
 *                  the dept signal — no dept text underneath.
 *   - `'card'`   — 4px solid dept-coloured top accent strip, full name
 *                  centred in the body. Optional title line ONLY when
 *                  `employee.title` is truthy AND there's vertical room.
 *                  Never falls back to dept; the strip is the dept signal.
 *   - `'avatar'` — Single circular initials chip in the dept colour,
 *                  centred. NO name beside it (the chip is the identity
 *                  for users who want a "minimal floor plan" look).
 *   - `'banner'` — 4px solid dept-coloured stripe on the left edge, full
 *                  name centred in the body. Stripe IS the dept signal;
 *                  no eyebrow text.
 *
 * Stored on `CanvasSettings` because it's a view preference (akin to
 * grid visibility), not a project property — persists per-office so a
 * user who prefers `'card'` keeps it across sessions.
 *
 * The string identifiers are unchanged from Wave 15 so persisted
 * payloads keep loading without migration.
 */
export type SeatLabelStyle = 'pill' | 'card' | 'avatar' | 'banner'

export const SEAT_LABEL_STYLES: readonly SeatLabelStyle[] = [
  'pill',
  'card',
  'avatar',
  'banner',
] as const

/**
 * Type-guard for unknown values parsed from a persisted payload — used
 * by the migration helper to fall back to the default when a legacy
 * office has no value or a corrupted one. Mirrors how
 * `loadFromLegacyPayload`'s `isLeaveType` / `isEmployeeStatus` validate
 * enum-like fields elsewhere in the codebase.
 */
export function isSeatLabelStyle(v: unknown): v is SeatLabelStyle {
  return (
    typeof v === 'string' &&
    (SEAT_LABEL_STYLES as readonly string[]).includes(v)
  )
}

export interface CanvasSettings {
  gridSize: number
  scale: number
  scaleUnit: LengthUnit
  showGrid: boolean
  /**
   * When true, a label appears at the midpoint of each wall segment showing
   * its length in `scale * pixels` rounded to 1 decimal + `scaleUnit`. Off by
   * default so the canvas stays uncluttered for new plans.
   */
  showDimensions: boolean
  /**
   * Heading (in degrees, 0-360) of the on-canvas north arrow. 0 means the
   * arrow points straight up. The user can drag the floating compass to
   * reorient the plan for wayfinding/exports. Optional for backward
   * compatibility with persisted projects that predate the field — readers
   * should treat `undefined` as `0`.
   */
  northRotation?: number
  /**
   * Whether the floating north-arrow compass renders on the canvas. Many
   * indoor floor plans have no real-world cardinal alignment and the
   * compass is just visual noise — toggle it off via View → "Toggle
   * compass" or the `N` hotkey. Optional for backward compatibility with
   * persisted projects that predate the field — readers should treat
   * `undefined` as `true` (the historical behaviour).
   */
  showNorthArrow?: boolean
  /**
   * Cosmetic style for per-seat labels. See `SeatLabelStyle` for the four
   * options. Optional for backward-compat with pre-Wave-15C payloads —
   * readers should treat `undefined` as `'pill'` (the baseline / current
   * rendering). Back-filled to `'pill'` in `ProjectShell` on load.
   */
  seatLabelStyle?: SeatLabelStyle
  /**
   * Wave 16 — when true, the small desk-id badge is painted in the top-
   * left corner of every assignable seat. Off by default so the canvas
   * reads as a glanceable plan rather than a roster table. The deskId
   * is also surfaced in the Properties panel and the hover card, so
   * hiding it on the canvas does not lose the information — it just
   * stops duplicating it across three surfaces.
   *
   * Optional for backward-compat with pre-Wave-16 payloads — readers
   * should treat `undefined` as `false` (the new default). The View
   * dropdown carries a "Show desk IDs" toggle.
   */
  showDeskIds?: boolean
}

export interface Project {
  id: string
  ownerId: string | null
  name: string
  slug: string
  buildingName: string | null
  floors: Floor[]
  activeFloorId: string
  canvasSettings: CanvasSettings
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  gridSize: 12,
  scale: 1,
  scaleUnit: 'ft',
  showGrid: true,
  showDimensions: false,
  northRotation: 0,
  showNorthArrow: true,
  seatLabelStyle: 'pill',
  showDeskIds: false,
}
