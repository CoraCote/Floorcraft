/**
 * Pure formatting helpers for the wall-drawing dimension pill (Fix 1 of
 * the P1 wall-drawing improvements).
 *
 * The drawing tool surfaces a small pill anchored on the midpoint of each
 * pending wall segment (committed-but-pre-finalisation segments AND the
 * live rubber-band preview) showing two pieces of information:
 *
 *   1. Length, formatted using the project scale + unit (`12.4 ft`,
 *      `3.8 m`, `380 px`). Uses the same `formatLength` + `toRealLength`
 *      helpers the rest of the editor uses for dimension readouts so a
 *      "12-ft wall" reads "12.0 ft" everywhere.
 *
 *   2. Angle, normalised mod 360° and rendered as an integer-degree
 *      string (`0°`, `45°`, `90°`). Within `CARDINAL_TOLERANCE_DEG` of a
 *      cardinal direction we append `→ N` / `→ S` / `→ E` / `→ W` so the
 *      user immediately sees that the segment is axis-aligned (matters
 *      most when the cardinal lock is engaged via Shift). The angle
 *      convention is degrees clockwise from East: 0° = right, 90° =
 *      down, 180° = left, 270° = up. We derive it from `atan2(dy, dx)`
 *      in screen coordinates (y grows down) so a pure-horizontal segment
 *      reads `0°` at left-to-right and `180°` at right-to-left, matching
 *      the user's reading of the cursor direction.
 *
 * The helpers live in their own module (rather than inside
 * `WallDrawingOverlay.tsx`) so they can be unit-tested without
 * mounting Konva. The renderer wires them up; the math lives here.
 */

import { formatLength, toRealLength, type LengthUnit } from './units'
import { LENGTH_UNIT_SUFFIX } from './units'

/**
 * Within how many degrees of a cardinal direction (N/S/E/W) we still
 * mark the readout as cardinal-aligned. 5° is loose enough to forgive a
 * sub-pixel cursor jitter at the moment of commit but tight enough that
 * a visibly off-axis segment never claims to be "exactly East."
 */
export const CARDINAL_TOLERANCE_DEG = 5

/**
 * Cardinal direction nearest to a given screen-space angle (degrees,
 * clockwise from East). Returns null when the input is more than
 * `CARDINAL_TOLERANCE_DEG` from any cardinal — keeps the pill string
 * honest when the user is freehand-drawing at, say, 12°.
 *
 * Direction mapping (screen coords, y grows down):
 *   ~0°    → 'E'  (cursor moved right)
 *   ~90°   → 'S'  (cursor moved down)
 *   ~180°  → 'W'  (cursor moved left)
 *   ~270°  → 'N'  (cursor moved up)
 */
export function cardinalForAngle(angleDeg: number): 'N' | 'S' | 'E' | 'W' | null {
  // Normalise into [0, 360). A segment of length zero (which the caller
  // already filters out) would feed NaN through atan2 — guard anyway so
  // a downstream consumer never gets a bad string.
  if (!Number.isFinite(angleDeg)) return null
  const a = ((angleDeg % 360) + 360) % 360
  // Distance to each of the four cardinals on the circular axis.
  const cardinals: Array<{ dir: 'E' | 'S' | 'W' | 'N'; at: number }> = [
    { dir: 'E', at: 0 },
    { dir: 'S', at: 90 },
    { dir: 'W', at: 180 },
    { dir: 'N', at: 270 },
  ]
  let best: { dir: 'E' | 'S' | 'W' | 'N'; dist: number } | null = null
  for (const c of cardinals) {
    // Circular distance: min(|a-c|, 360-|a-c|) so 359° is one degree
    // from 0° not 359 degrees.
    const raw = Math.abs(a - c.at)
    const dist = Math.min(raw, 360 - raw)
    if (!best || dist < best.dist) best = { dir: c.dir, dist }
  }
  if (!best) return null
  return best.dist <= CARDINAL_TOLERANCE_DEG ? best.dir : null
}

/**
 * Build the text shown inside the dimension pill for a single segment.
 *
 * `lengthCanvasPx` is the segment's actual (post-snap, post-cardinal-lock)
 * canvas-space length in pixels. The function converts it to the project's
 * configured real-world unit and formats it using the same `formatLength`
 * helper as the rest of the editor — ensuring `12.0 ft` reads identically
 * here as it does in dimension labels and the status bar.
 *
 * The angle is rendered to integer degrees (rounded). Within
 * `CARDINAL_TOLERANCE_DEG` of a cardinal we append the compass direction
 * — gives the user a strong "yes you're locked to East" signal without
 * shouting when freehand-drawing at, say, 31°.
 *
 * Output shape: `<length><space><unit><newline><angle>°` or
 * `<length><space><unit><newline><angle>° → <dir>`.
 *
 * Two-line shape (vs. one space-separated string) is deliberate: the pill
 * is displayed centred above the segment midpoint, and stacking length
 * over angle keeps the pill narrow and readable at a glance.
 */
export function formatDimensionPillText(
  lengthCanvasPx: number,
  angleDeg: number,
  scale: number,
  unit: LengthUnit,
): string {
  const real = toRealLength(lengthCanvasPx, scale, unit)
  const lenStr = `${formatLength(real, unit)} ${LENGTH_UNIT_SUFFIX[unit]}`
  // Round to the nearest integer for compactness. atan2 gives radians;
  // we work in degrees here. `((x % 360) + 360) % 360` normalises into
  // [0, 360) so a -10° drag reads as 350°.
  const normalised = ((Math.round(angleDeg) % 360) + 360) % 360
  const cardinal = cardinalForAngle(angleDeg)
  const angleStr = cardinal ? `${normalised}° → ${cardinal}` : `${normalised}°`
  return `${lenStr}\n${angleStr}`
}

/**
 * Compute the angle of a screen-space segment in degrees clockwise from
 * East. Returns 0 for a zero-length segment (caller is expected to skip
 * the pill in that case anyway).
 */
export function segmentAngleDeg(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0
  const dy = y1 - y0
  if (dx === 0 && dy === 0) return 0
  return (Math.atan2(dy, dx) * 180) / Math.PI
}
