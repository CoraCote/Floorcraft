import { describe, it, expect } from 'vitest'
import {
  pointDistance,
  deriveCalibration,
} from '../lib/calibrateScale'

describe('pointDistance', () => {
  it('returns the Euclidean distance between two canvas points', () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(pointDistance({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(0)
    expect(pointDistance({ x: -5, y: 0 }, { x: 5, y: 0 })).toBe(10)
  })

  it('is order-independent', () => {
    const a = { x: 7, y: 11 }
    const b = { x: -3, y: 4 }
    expect(pointDistance(a, b)).toBe(pointDistance(b, a))
  })
})

describe('deriveCalibration', () => {
  it('derives scale for the stated unit when two points are 200 px apart and called 10 ft', () => {
    const result = deriveCalibration(
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      10,
      'ft',
    )
    expect(result).not.toBeNull()
    expect(result!.scale).toBeCloseTo(0.05, 10)
    expect(result!.scaleUnit).toBe('ft')
  })

  it('uses hypotenuse distance for diagonal measurements', () => {
    // 3-4-5 triangle → 5 px distance; user states it's 1 m
    const result = deriveCalibration(
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      1,
      'm',
    )
    expect(result).not.toBeNull()
    expect(result!.scale).toBeCloseTo(0.2, 10)
    expect(result!.scaleUnit).toBe('m')
  })

  it('supports inches and centimeters', () => {
    const inches = deriveCalibration(
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      10,
      'in',
    )
    expect(inches!.scaleUnit).toBe('in')
    expect(inches!.scale).toBeCloseTo(0.2, 10)

    const cm = deriveCalibration(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      25,
      'cm',
    )
    expect(cm!.scaleUnit).toBe('cm')
    expect(cm!.scale).toBeCloseTo(0.25, 10)
  })

  it('rejects identical points (zero canvas distance)', () => {
    expect(
      deriveCalibration({ x: 5, y: 5 }, { x: 5, y: 5 }, 10, 'ft'),
    ).toBeNull()
  })

  it('rejects zero, negative, and non-finite real distances', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    expect(deriveCalibration(a, b, 0, 'ft')).toBeNull()
    expect(deriveCalibration(a, b, -5, 'ft')).toBeNull()
    expect(deriveCalibration(a, b, Number.NaN, 'ft')).toBeNull()
    expect(deriveCalibration(a, b, Number.POSITIVE_INFINITY, 'ft')).toBeNull()
  })

  it('rejects the px pass-through unit — calibration is only meaningful for real-world units', () => {
    expect(
      deriveCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, 'px'),
    ).toBeNull()
  })

  it('round-trips: applying the returned scale reproduces the stated real distance', () => {
    const a = { x: 12, y: 34 }
    const b = { x: 112, y: 34 } // 100 px apart
    const stated = 7.5 // ft
    const result = deriveCalibration(a, b, stated, 'ft')
    expect(result).not.toBeNull()
    // canvasPx * scale should equal the stated real distance
    const canvasPx = pointDistance(a, b)
    expect(canvasPx * result!.scale).toBeCloseTo(stated, 10)
  })
})
