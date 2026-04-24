/**
 * Pure layout math for the "marketing-screenshot" chrome that wraps PNG and
 * PDF floor-plan exports — title block, generated-at timestamp, scale bar,
 * neighborhood legend, and the small Floorcraft watermark.
 *
 * No DOM, no jspdf imports. The PNG exporter draws via the Canvas 2D API,
 * the PDF exporter draws via jspdf primitives — both consume the same
 * `ChromeLayout` struct so the visual proportions stay aligned. Keeping
 * this file pure also keeps it cheap to unit-test (no canvas mocks).
 */

import type { LengthUnit } from './units'

/** Margin sizes (in canvas pixels) — referenced in the PNG/PDF drawers. */
export const CHROME_MARGINS = {
  /** Total top region: 40px gray strip + 60px white title band. */
  topStripHeight: 40,
  titleBandHeight: 60,
  side: 40,
  bottom: 70,
} as const

const TOP_TOTAL =
  CHROME_MARGINS.topStripHeight + CHROME_MARGINS.titleBandHeight

export interface ExportChromeContext {
  officeName: string
  floorName: string
  generatedAt: Date
  /**
   * Pixels per real-world unit on the canvas. `null` when the project is
   * uncalibrated, or when the unit is `'px'` (no real-world meaning).
   */
  pxPerUnit: number | null
  scaleUnit: LengthUnit
  neighborhoods: Array<{ id: string; name: string; color: string }>
  /** Original Konva-stage export dimensions, before chrome is added. */
  canvasWidth: number
  canvasHeight: number
}

export interface ChromeLayout {
  outer: { width: number; height: number }
  canvas: { x: number; y: number; width: number; height: number }
  topStrip: { y: number; height: number }
  titleBand: { y: number; height: number }
  bottomBand: { y: number; height: number }
  scaleBar: {
    x: number
    y: number
    pxLength: number
    label: string
  } | null
  legend: {
    x: number
    y: number
    items: Array<{ name: string; color: string }>
  } | null
  watermark: { x: number; y: number; text: string }
  timestampText: string
  titleText: string
  subtitleText: string
}

const NICE_STEPS: readonly number[] = [1, 2, 5, 10, 20, 50, 100, 200, 500]

/**
 * Pick a "nice" round real-world length that fits in roughly `targetPx` pixels
 * on the canvas, then return the geometry for drawing it as a scale bar.
 *
 * The classic "magnitude × 1/2/5" cascade: snap up to the next entry of
 * `NICE_STEPS` scaled by the appropriate power of ten. This yields values
 * a facilities manager can sanity-check against a tape measure (1 ft, 5 ft,
 * 10 ft) instead of `13.7 ft` or some other arithmetic artifact.
 */
export function computeScaleBar(
  pxPerUnit: number,
  unit: 'ft' | 'm' | 'in' | 'cm',
  targetPx = 120,
): { realLength: number; pxLength: number; label: string } {
  const realApprox = targetPx / pxPerUnit
  const exponent = Math.floor(Math.log10(realApprox))
  const base = Math.pow(10, exponent)
  let nice = NICE_STEPS[NICE_STEPS.length - 1] * base
  for (const s of NICE_STEPS) {
    if (s * base >= realApprox) {
      nice = s * base
      break
    }
  }
  return {
    realLength: nice,
    pxLength: nice * pxPerUnit,
    label: `${nice} ${unit}`,
  }
}

/**
 * Format the generated-at timestamp shown in the top-strip. Uses
 * `Intl.DateTimeFormat` so the rendered string respects the user's locale
 * conventions (month name, AM/PM). Always prefixed with `"Generated "` so
 * the regex in tests has a stable anchor.
 */
export function formatGeneratedAt(d: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }
  // `en-US` keeps the format predictable across CI machines whose locale
  // might otherwise be `C` or `en-GB` and produce a different ordering.
  const formatted = new Intl.DateTimeFormat('en-US', opts).format(d)
  // ICU formats vary by Node version: some emit `April 24, 2026, 8:42 AM`,
  // others emit `April 24, 2026 at 8:42 AM`. Normalize either separator
  // to the mid-dot the design spec uses for visual rhythm.
  return `Generated ${formatted
    .replace(/,? at (?=\d{1,2}:\d{2})/, ' \u00b7 ')
    .replace(/, (?=\d{1,2}:\d{2})/, ' \u00b7 ')}`
}

/**
 * Compose the full `ChromeLayout` for the given context. Pure — every output
 * is a number or string derived solely from the inputs, so unit tests don't
 * need a canvas or pdf instance to verify positioning.
 */
export function layoutChrome(ctx: ExportChromeContext): ChromeLayout {
  const outerWidth = ctx.canvasWidth + CHROME_MARGINS.side * 2
  const outerHeight =
    ctx.canvasHeight + TOP_TOTAL + CHROME_MARGINS.bottom

  const canvasBox = {
    x: CHROME_MARGINS.side,
    y: TOP_TOTAL,
    width: ctx.canvasWidth,
    height: ctx.canvasHeight,
  }

  const topStrip = { y: 0, height: CHROME_MARGINS.topStripHeight }
  const titleBand = {
    y: CHROME_MARGINS.topStripHeight,
    height: CHROME_MARGINS.titleBandHeight,
  }
  const bottomBand = {
    y: TOP_TOTAL + ctx.canvasHeight,
    height: CHROME_MARGINS.bottom,
  }

  // Scale bar: omitted when uncalibrated or when the unit is the
  // pass-through `'px'` (no real-world meaning to label).
  let scaleBar: ChromeLayout['scaleBar'] = null
  if (
    ctx.pxPerUnit !== null &&
    ctx.pxPerUnit > 0 &&
    ctx.scaleUnit !== 'px'
  ) {
    const sb = computeScaleBar(ctx.pxPerUnit, ctx.scaleUnit)
    scaleBar = {
      x: CHROME_MARGINS.side,
      // Bar sits about a third of the way down the bottom band so the label
      // below it has clearance from the watermark.
      y: bottomBand.y + 22,
      pxLength: sb.pxLength,
      label: sb.label,
    }
  }

  // Legend: at most 6 entries, top-right of the bottom band. We don't lay
  // out the wrap row positions here — the drawer handles wrap because it
  // knows the actual measured text width per font/renderer. We only cap the
  // entry count + supply the data.
  let legend: ChromeLayout['legend'] = null
  if (ctx.neighborhoods.length > 0) {
    const items = ctx.neighborhoods
      .slice(0, 6)
      .map((n) => ({ name: n.name, color: n.color }))
    legend = {
      x: outerWidth - CHROME_MARGINS.side,
      y: bottomBand.y + 18,
      items,
    }
  }

  const watermark = {
    x: outerWidth / 2,
    y: bottomBand.y + bottomBand.height - 12,
    text: 'floorcraft.app',
  }

  return {
    outer: { width: outerWidth, height: outerHeight },
    canvas: canvasBox,
    topStrip,
    titleBand,
    bottomBand,
    scaleBar,
    legend,
    watermark,
    timestampText: formatGeneratedAt(ctx.generatedAt),
    titleText: ctx.officeName || 'Untitled office',
    subtitleText: `Floor / ${ctx.floorName || 'Untitled floor'}`,
  }
}
