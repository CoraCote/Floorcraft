import { describe, it, expect } from 'vitest'
import { computeCenteringPosition } from '../lib/canvasFocus'

describe('computeCenteringPosition', () => {
  it('centers an element at (100,100) of size 50x50 in a 800x600 viewport at scale 1', () => {
    const result = computeCenteringPosition({
      element: { x: 100, y: 100, width: 50, height: 50 },
      viewport: { width: 800, height: 600 },
      scale: 1,
    })
    expect(result.x).toBe(275)
    expect(result.y).toBe(175)
  })

  it('respects scale — at scale 2 an element at (100,100) needs doubled stage offset', () => {
    const result = computeCenteringPosition({
      element: { x: 100, y: 100, width: 50, height: 50 },
      viewport: { width: 800, height: 600 },
      scale: 2,
    })
    expect(result.x).toBe(150)
    expect(result.y).toBe(50)
  })

  it('respects element rotation by treating the axis-aligned bounding box center', () => {
    const result = computeCenteringPosition({
      element: { x: 0, y: 0, width: 100, height: 100 },
      viewport: { width: 400, height: 400 },
      scale: 1,
    })
    expect(result).toEqual({ x: 150, y: 150 })
  })
})
