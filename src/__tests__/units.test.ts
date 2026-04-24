import { describe, it, expect } from 'vitest'
import {
  toRealLength,
  formatLength,
  formatCanvasLength,
  toRealArea,
  formatCanvasArea,
  deriveScaleFromCalibration,
  LENGTH_UNITS,
  LENGTH_UNIT_LABELS,
  LENGTH_UNIT_SUFFIX,
} from '../lib/units'

describe('units lookup tables', () => {
  it('exposes every unit with a label and a suffix', () => {
    for (const u of LENGTH_UNITS) {
      expect(LENGTH_UNIT_LABELS[u]).toBeTruthy()
      expect(LENGTH_UNIT_SUFFIX[u]).toBeTruthy()
    }
  })
})

describe('toRealLength', () => {
  it('passes pixels through unchanged', () => {
    expect(toRealLength(100, 0.5, 'px')).toBe(100)
  })

  it('multiplies canvas px by scale for real-world units', () => {
    expect(toRealLength(100, 0.5, 'ft')).toBe(50)
    expect(toRealLength(200, 0.25, 'm')).toBe(50)
  })

  it('handles zero distance', () => {
    expect(toRealLength(0, 0.5, 'ft')).toBe(0)
  })
})

describe('formatLength', () => {
  it('uses 2 decimals for meters (centimeter resolution)', () => {
    expect(formatLength(1.2345, 'm')).toBe('1.23')
  })

  it('uses 1 decimal for feet / inches / cm / px', () => {
    expect(formatLength(1.2345, 'ft')).toBe('1.2')
    expect(formatLength(1.2345, 'in')).toBe('1.2')
    expect(formatLength(1.2345, 'cm')).toBe('1.2')
    expect(formatLength(1.2345, 'px')).toBe('1.2')
  })

  it('clamps tiny values to 0 to avoid "-0.0" readouts', () => {
    expect(formatLength(-0.0001, 'ft')).toBe('0.0')
    expect(formatLength(0.04, 'ft')).toBe('0.0')
  })

  it('preserves values just above the clamp threshold', () => {
    expect(formatLength(0.06, 'ft')).toBe('0.1')
  })
})

describe('formatCanvasLength', () => {
  it('converts then formats then appends the unit suffix', () => {
    // 100 canvas px at scale 0.5 → 50 ft → "50.0 ft"
    expect(formatCanvasLength(100, 0.5, 'ft')).toBe('50.0 ft')
    // pass-through for px
    expect(formatCanvasLength(100, 0.5, 'px')).toBe('100.0 px')
    // meters get 2 decimals
    expect(formatCanvasLength(123, 0.01, 'm')).toBe('1.23 m')
  })
})

describe('toRealArea', () => {
  it('scales area by the SQUARE of the linear scale', () => {
    // a 10x10 canvas box at scale 0.5 ft/px is 100 px² → 25 ft²
    expect(toRealArea(100, 0.5, 'ft')).toBe(25)
  })

  it('passes pixels through unchanged', () => {
    expect(toRealArea(100, 0.5, 'px')).toBe(100)
  })
})

describe('formatCanvasArea', () => {
  it('appends the squared-unit suffix', () => {
    expect(formatCanvasArea(100, 0.5, 'ft')).toBe('25.0 ft\u00B2')
    expect(formatCanvasArea(10000, 0.01, 'm')).toBe('1.00 m\u00B2')
  })
})

describe('deriveScaleFromCalibration', () => {
  it('returns the ratio of real to canvas distance', () => {
    // a 200-canvas-px measurement stated to be 10 ft → scale = 0.05
    expect(deriveScaleFromCalibration(200, 10)).toBeCloseTo(0.05, 10)
  })

  it('rejects zero or negative canvas distance', () => {
    expect(deriveScaleFromCalibration(0, 10)).toBeNull()
    expect(deriveScaleFromCalibration(-5, 10)).toBeNull()
  })

  it('rejects zero or negative real value', () => {
    expect(deriveScaleFromCalibration(200, 0)).toBeNull()
    expect(deriveScaleFromCalibration(200, -5)).toBeNull()
  })

  it('rejects non-finite input', () => {
    expect(deriveScaleFromCalibration(Number.NaN, 10)).toBeNull()
    expect(deriveScaleFromCalibration(200, Number.POSITIVE_INFINITY)).toBeNull()
  })
})
