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
