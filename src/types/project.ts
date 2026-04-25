import type { Floor } from './floor'
import type { LengthUnit } from '../lib/units'

/**
 * Cosmetic style for the per-seat employee label painted inside desks,
 * workstation slots, and private offices. The four styles trade between
 * density, decoration, and which pieces of information are foregrounded:
 *
 *   - `'pill'`   — baseline (current behaviour). Department-tinted pill
 *                  centred on the seat, name bold, dept subtitle below.
 *                  Reads as "badge on a desk" and is the most compact.
 *   - `'card'`   — JSON-Crack-style miniature card: solid department-
 *                  coloured header strip with uppercase caps, white body
 *                  with centred name + title/dept line. Crisp 1px dept
 *                  border. The most "documented seat" of the four —
 *                  looks great at high zoom, degrades gracefully on small
 *                  desks by dropping the header strip.
 *   - `'avatar'` — Circular initials chip in the department colour beside
 *                  the name. Trades vertical density for identity cues;
 *                  best when the user is hunting for a specific person.
 *   - `'banner'` — 4px vertical accent stripe on the left edge, plain
 *                  name on the cream desk fill with an uppercase dept
 *                  eyebrow above. Minimal decoration, maximum legibility.
 *
 * Stored on `CanvasSettings` because it's a view preference (akin to
 * grid visibility), not a project property — persists per-office so a
 * user who prefers `'card'` keeps it across sessions.
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
}
