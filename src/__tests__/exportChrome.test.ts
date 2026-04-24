import { describe, it, expect } from 'vitest'
import {
  computeScaleBar,
  formatGeneratedAt,
  layoutChrome,
  CHROME_MARGINS,
  type ExportChromeContext,
} from '../lib/exportChrome'

describe('computeScaleBar', () => {
  // The classic "magnitude × 1/2/5" snap. Spot-check a few realistic
  // pxPerUnit values that match the project's `1 / settings.scale` math.

  it('snaps to 10 when 12 px per ft fits ~10 ft into 120 px', () => {
    const sb = computeScaleBar(12, 'ft')
    expect(sb.realLength).toBe(10)
    expect(sb.pxLength).toBe(120)
    expect(sb.label).toBe('10 ft')
  })

  it('snaps to 5 when ~5 ft fits the target width', () => {
    // realApprox = 120 / 24 = 5 → exact 5
    const sb = computeScaleBar(24, 'ft')
    expect(sb.realLength).toBe(5)
    expect(sb.label).toBe('5 ft')
  })

  it('snaps to 2 m when 1.7 m would fit exactly', () => {
    // realApprox ≈ 1.71 → snaps up to 2
    const sb = computeScaleBar(70, 'm')
    expect(sb.realLength).toBe(2)
    expect(sb.label).toBe('2 m')
  })

  it('handles sub-unit pxPerUnit (very wide canvases)', () => {
    // realApprox = 120 / 0.4 = 300 → snaps up to 500
    const sb = computeScaleBar(0.4, 'ft')
    expect(sb.realLength).toBe(500)
    expect(sb.pxLength).toBeCloseTo(200)
  })

  it('honors a custom targetPx', () => {
    const sb = computeScaleBar(10, 'in', 200)
    // realApprox = 200 / 10 = 20 → snaps to 20
    expect(sb.realLength).toBe(20)
    expect(sb.pxLength).toBe(200)
  })
})

describe('formatGeneratedAt', () => {
  it('starts with "Generated " and includes the four-digit year', () => {
    const text = formatGeneratedAt(new Date('2026-04-24T15:42:00Z'))
    expect(text).toMatch(/^Generated .+ \d{4}/)
  })

  it('uses a mid-dot separator between the date and the time', () => {
    const text = formatGeneratedAt(new Date('2026-04-24T15:42:00Z'))
    expect(text).toContain('\u00b7')
  })
})

describe('layoutChrome', () => {
  function ctx(overrides: Partial<ExportChromeContext> = {}): ExportChromeContext {
    return {
      officeName: 'Acme HQ',
      floorName: 'Floor 1',
      generatedAt: new Date('2026-04-24T15:42:00Z'),
      pxPerUnit: 12,
      scaleUnit: 'ft',
      neighborhoods: [
        { id: 'n1', name: 'Engineering', color: '#3B82F6' },
        { id: 'n2', name: 'Sales', color: '#10B981' },
      ],
      canvasWidth: 800,
      canvasHeight: 600,
      ...overrides,
    }
  }

  it('returns outer dimensions = canvas + chrome margins', () => {
    const layout = layoutChrome(ctx())
    expect(layout.outer.width).toBe(800 + CHROME_MARGINS.side * 2)
    expect(layout.outer.height).toBe(
      600 +
        CHROME_MARGINS.topStripHeight +
        CHROME_MARGINS.titleBandHeight +
        CHROME_MARGINS.bottom,
    )
  })

  it('places the canvas image inset from the side and below the title band', () => {
    const layout = layoutChrome(ctx())
    expect(layout.canvas.x).toBe(CHROME_MARGINS.side)
    expect(layout.canvas.y).toBe(
      CHROME_MARGINS.topStripHeight + CHROME_MARGINS.titleBandHeight,
    )
    expect(layout.canvas.width).toBe(800)
    expect(layout.canvas.height).toBe(600)
  })

  it('positions the bottom band immediately under the canvas', () => {
    const layout = layoutChrome(ctx())
    expect(layout.bottomBand.y).toBe(layout.canvas.y + layout.canvas.height)
    expect(layout.bottomBand.height).toBe(CHROME_MARGINS.bottom)
  })

  it('emits a scale bar when the project is calibrated', () => {
    const layout = layoutChrome(ctx())
    expect(layout.scaleBar).not.toBeNull()
    expect(layout.scaleBar?.label).toMatch(/\d+ ft$/)
    expect(layout.scaleBar?.pxLength).toBeGreaterThan(0)
  })

  it('omits the scale bar when pxPerUnit is null', () => {
    const layout = layoutChrome(ctx({ pxPerUnit: null }))
    expect(layout.scaleBar).toBeNull()
  })

  it('omits the scale bar when the unit is "px"', () => {
    const layout = layoutChrome(ctx({ pxPerUnit: 1, scaleUnit: 'px' }))
    expect(layout.scaleBar).toBeNull()
  })

  it('emits a legend with up to six neighborhoods', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      name: `N ${i}`,
      color: '#000000',
    }))
    const layout = layoutChrome(ctx({ neighborhoods: many }))
    expect(layout.legend?.items.length).toBe(6)
  })

  it('omits the legend when there are no neighborhoods', () => {
    const layout = layoutChrome(ctx({ neighborhoods: [] }))
    expect(layout.legend).toBeNull()
  })

  it('produces a timestamp string matching the spec regex', () => {
    const layout = layoutChrome(ctx())
    expect(layout.timestampText).toMatch(/^Generated .+ \d{4}/)
  })

  it('falls back to "Untitled office"/"Untitled floor" when names are empty', () => {
    const layout = layoutChrome(ctx({ officeName: '', floorName: '' }))
    expect(layout.titleText).toBe('Untitled office')
    expect(layout.subtitleText).toBe('Floor / Untitled floor')
  })

  it('places the watermark centered horizontally near the bottom edge', () => {
    const layout = layoutChrome(ctx())
    expect(layout.watermark.x).toBe(layout.outer.width / 2)
    expect(layout.watermark.text).toBe('floorcraft.app')
    expect(layout.watermark.y).toBeLessThan(layout.outer.height)
    expect(layout.watermark.y).toBeGreaterThan(layout.bottomBand.y)
  })
})
