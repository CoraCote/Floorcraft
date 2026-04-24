/**
 * Two-click "set scale" calibrator math.
 *
 * The user picks two points on a floor plan whose real-world distance is
 * known (e.g. a hallway the architect has labelled "20 ft") and types that
 * distance + unit. We derive the `scale` multiplier that makes the canvas
 * read in the stated unit: `scale = realDistance / canvasPixelDistance`.
 *
 * This file is intentionally pure — no React, no stores, no DOM — so the
 * math is trivial to unit-test and reusable from anywhere (e.g. keyboard
 * handlers, automated tests, future "batch calibrate from image OCR"
 * features).
 */

import type { LengthUnit } from './units'
import { deriveScaleFromCalibration } from './units'

export interface Point {
  x: number
  y: number
}

export interface CalibrationResult {
  /** Multiplier `realValue = canvasPx * scale`. */
  scale: number
  /**
   * The unit the user typed the distance in. We push this back into the
   * project so "entered 20 ft" results in a project that reads in feet,
   * not whatever it was configured as before.
   */
  scaleUnit: LengthUnit
}

/** Euclidean distance between two canvas points. */
export function pointDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Given two canvas points, a real-world distance, and the unit that
 * distance is in, compute the project scale + scaleUnit pair to apply.
 *
 * Returns `null` for any input the calibrator cannot reasonably honour:
 *   - identical (or sub-pixel) points → zero canvas distance
 *   - zero / negative / non-finite real distance
 *   - the `px` pass-through unit (calibration is meaningless — the answer
 *     is always 1:1 by definition, and allowing it would let a stray
 *     click-pair silently stomp the user's real-world scale with 1.0)
 *
 * Callers show a validation error on `null`; they must not apply a null
 * result or the rest of the app hits divide-by-zero / infinity math.
 */
export function deriveCalibration(
  a: Point,
  b: Point,
  realDistance: number,
  unit: LengthUnit,
): CalibrationResult | null {
  if (unit === 'px') return null
  const canvasPx = pointDistance(a, b)
  const scale = deriveScaleFromCalibration(canvasPx, realDistance)
  if (scale === null) return null
  return { scale, scaleUnit: unit }
}
