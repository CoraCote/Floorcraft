import { describe, it, expect } from 'vitest'
import { elementBounds, unionBounds } from '../lib/elementBounds'
import type { CanvasElement, DeskElement, WallElement } from '../types/elements'

function desk(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: 'd1',
    type: 'desk',
    x: 100,
    y: 100,
    width: 40,
    height: 20,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    // DeskElement-specific fields; assignedEmployeeId is nullable.
    assignedEmployeeId: null,
    ...overrides,
  } as DeskElement
}

function wall(points: number[]): WallElement {
  return {
    id: 'w1',
    type: 'wall',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: 'transparent', stroke: '#000', strokeWidth: 4, opacity: 1 },
    points,
    thickness: 4,
    wallType: 'solid',
  }
}

describe('elementBounds', () => {
  it('returns a center-origin AABB for regular elements', () => {
    const b = elementBounds(desk({ x: 100, y: 200, width: 40, height: 20 }))
    expect(b).toEqual({ x: 80, y: 190, width: 40, height: 20 })
  })

  it('scans points for walls', () => {
    const b = elementBounds(wall([0, 0, 100, 0, 100, 50]))
    expect(b).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })

  it('returns null for a wall with fewer than 2 points', () => {
    expect(elementBounds(wall([]))).toBeNull()
  })

  it('expands the AABB to cover rotated corners (90°)', () => {
    // 90° rotation swaps width/height. A 40x20 desk at (100,100)
    // rotated 90° becomes a 20-wide, 40-tall box at (90, 80).
    const b = elementBounds(desk({ x: 100, y: 100, width: 40, height: 20, rotation: 90 }))
    expect(b!.x).toBeCloseTo(90, 6)
    expect(b!.y).toBeCloseTo(80, 6)
    expect(b!.width).toBeCloseTo(20, 6)
    expect(b!.height).toBeCloseTo(40, 6)
  })

  it('expands the AABB to cover rotated corners (45°)', () => {
    // 40x40 square at (0,0) rotated 45°. Diagonal = 40·√2 ≈ 56.57,
    // so the rotated AABB is 56.57 on each side, centered on origin.
    const b = elementBounds(desk({ x: 0, y: 0, width: 40, height: 40, rotation: 45 }))
    const expected = 40 * Math.SQRT2
    expect(b!.width).toBeCloseTo(expected, 5)
    expect(b!.height).toBeCloseTo(expected, 5)
    expect(b!.x).toBeCloseTo(-expected / 2, 5)
    expect(b!.y).toBeCloseTo(-expected / 2, 5)
  })

  it('treats rotation === 0 as the unrotated AABB', () => {
    // Defensive: the fast path for the common case must match the
    // pre-rotation behaviour exactly so callers that compare bounds
    // for equality (e.g. snap-guides) keep working.
    const b = elementBounds(desk({ x: 50, y: 50, width: 40, height: 20, rotation: 0 }))
    expect(b).toEqual({ x: 30, y: 40, width: 40, height: 20 })
  })
})

describe('unionBounds', () => {
  it('unions multiple elements', () => {
    const a: CanvasElement = desk({ id: 'a', x: 0, y: 0, width: 10, height: 10 })
    const b: CanvasElement = desk({ id: 'b', x: 100, y: 100, width: 10, height: 10 })
    // a = [-5..5, -5..5], b = [95..105, 95..105] => [-5..105, -5..105]
    expect(unionBounds([a, b])).toEqual({ x: -5, y: -5, width: 110, height: 110 })
  })

  it('returns null for empty input', () => {
    expect(unionBounds([])).toBeNull()
  })

  it('applies optional padding on every side', () => {
    const a: CanvasElement = desk({ id: 'a', x: 0, y: 0, width: 10, height: 10 })
    const result = unionBounds([a], 5)
    // original bounds [-5..5]; padded [-10..10]
    expect(result).toEqual({ x: -10, y: -10, width: 20, height: 20 })
  })

  it('skips walls with degenerate geometry but still unions the rest', () => {
    const a: CanvasElement = desk({ id: 'a', x: 0, y: 0, width: 10, height: 10 })
    const w: CanvasElement = wall([])
    const result = unionBounds([a, w])
    expect(result).toEqual({ x: -5, y: -5, width: 10, height: 10 })
  })
})
