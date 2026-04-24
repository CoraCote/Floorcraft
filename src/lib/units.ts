/**
 * Unit conversion + formatting for the canvas.
 *
 * Mental model: the canvas natively lives in "canvas units" (a dimensionless
 * pixel-like space). A project has a `scale` multiplier and a `scaleUnit`
 * that together convert canvas units → real-world measurements:
 *
 *     realValue = canvasPx * scale
 *     realLabel = `${realValue.toFixed(n)} ${scaleUnit}`
 *
 * This module is the one place those conversions happen so adding a new
 * unit (yards, mm, etc.) or tweaking precision doesn't ripple through
 * every consumer.
 */

/** Every length unit the app understands for display. `px` = pass-through. */
export type LengthUnit = 'px' | 'in' | 'ft' | 'cm' | 'm'

/** All units, in the order we want them presented in dropdowns. */
export const LENGTH_UNITS: readonly LengthUnit[] = ['ft', 'in', 'm', 'cm', 'px'] as const

/** Short, unambiguous labels for select-menu rendering. */
export const LENGTH_UNIT_LABELS: Record<LengthUnit, string> = {
  px: 'Pixels',
  in: 'Inches',
  ft: 'Feet',
  cm: 'Centimeters',
  m: 'Meters',
}

/** The suffix rendered next to a number (e.g. `3.5 ft`). */
export const LENGTH_UNIT_SUFFIX: Record<LengthUnit, string> = {
  px: 'px',
  in: 'in',
  ft: 'ft',
  cm: 'cm',
  m: 'm',
}

/**
 * Convert a canvas-pixel length into the real-world value at the project's
 * scale. `px` is a pass-through (no conversion) so the readout still works
 * in projects that haven't been calibrated.
 */
export function toRealLength(canvasPx: number, scale: number, unit: LengthUnit): number {
  if (unit === 'px') return canvasPx
  return canvasPx * scale
}

/**
 * Format a real-world length as a short, human-readable string — no unit
 * suffix (callers compose that themselves to control spacing/styling).
 *
 * Precision is unit-adaptive so `0.01 m` doesn't show as `0.0 m`:
 *   - feet / inches / pixels → 1 decimal
 *   - centimeters            → 1 decimal (good scale for interior work)
 *   - meters                 → 2 decimals (subdividing to the centimeter)
 *
 * Small values (< 0.05 in the selected unit) are clamped to 0 so we don't
 * render `-0.0` when subtracting two equal floats.
 */
export function formatLength(value: number, unit: LengthUnit): string {
  const rounded = Math.abs(value) < 0.05 ? 0 : value
  if (unit === 'm') return rounded.toFixed(2)
  return rounded.toFixed(1)
}

/**
 * Convenience: convert + format + append the suffix. The canonical "one
 * call to render a canvas distance" used by the status bar and measure
 * overlay.
 */
export function formatCanvasLength(canvasPx: number, scale: number, unit: LengthUnit): string {
  const v = toRealLength(canvasPx, scale, unit)
  return `${formatLength(v, unit)} ${LENGTH_UNIT_SUFFIX[unit]}`
}

/**
 * Convert a canvas-pixel AREA into the real-world value at the project's
 * scale. Area scales with the square of the linear scale, so the math is
 * distinct from `toRealLength`. Returned value is in the unit SQUARED
 * (e.g. ft² for unit='ft'). Pixels pass through unsquared.
 */
export function toRealArea(canvasAreaPx: number, scale: number, unit: LengthUnit): number {
  if (unit === 'px') return canvasAreaPx
  return canvasAreaPx * scale * scale
}

/**
 * Format an AREA with a squared-unit suffix (e.g. `120.5 ft²`). Uses the
 * UTF-8 superscript-2 so callers don't need to know how to render `²`.
 */
export function formatCanvasArea(canvasAreaPx: number, scale: number, unit: LengthUnit): string {
  const v = toRealArea(canvasAreaPx, scale, unit)
  return `${formatLength(v, unit)} ${LENGTH_UNIT_SUFFIX[unit]}\u00B2`
}

/**
 * Given a measured canvas-pixel distance and the user's stated real-world
 * value in the active unit, derive the `scale` multiplier that would make
 * the two agree. Used by the "set scale" two-click calibrator.
 *
 * Guards against a zero canvas distance (two clicks on the exact same
 * pixel would otherwise produce Infinity) and against a zero or negative
 * real value. Returns `null` for invalid input so the caller can show an
 * error message instead of silently corrupting the project scale.
 */
export function deriveScaleFromCalibration(
  canvasPx: number,
  realValue: number,
): number | null {
  if (!Number.isFinite(canvasPx) || !Number.isFinite(realValue)) return null
  if (canvasPx <= 0) return null
  if (realValue <= 0) return null
  return realValue / canvasPx
}
