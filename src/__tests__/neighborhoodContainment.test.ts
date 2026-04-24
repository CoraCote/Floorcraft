import { describe, it, expect } from 'vitest'
import {
  elementInNeighborhood,
  getElementsInNeighborhood,
} from '../lib/neighborhoodContainment'
import type { CanvasElement, DeskElement } from '../types/elements'
import type { Neighborhood } from '../types/neighborhood'

function desk(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: overrides.id ?? 'd1',
    type: 'desk',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Desk',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: overrides.deskId ?? 'DSK-1',
    assignedEmployeeId: null,
    capacity: 1,
    ...overrides,
  } as DeskElement
}

const nb: Neighborhood = {
  id: 'n1',
  name: 'Pod',
  color: '#000',
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  floorId: 'floor-1',
}

describe('elementInNeighborhood', () => {
  it('returns true for an element fully inside the neighborhood', () => {
    // Neighborhood spans x: 0..200, y: 50..150. Desk centered at (100,100)
    // with 40x40 → bounds 80..120, 80..120 → wholly inside.
    const el = desk({ x: 100, y: 100 })
    expect(elementInNeighborhood(el, nb)).toBe(true)
  })

  it('returns true for an element straddling the boundary', () => {
    // Desk centered at the right edge (x=200) → half inside, half outside.
    const el = desk({ x: 200, y: 100 })
    expect(elementInNeighborhood(el, nb)).toBe(true)
  })

  it('returns true when edges exactly touch (inclusive)', () => {
    // Right edge of desk aligned with left edge of neighborhood.
    const el = desk({ x: 0 - 20, y: 100 }) // bounds end at -20+20=0
    expect(elementInNeighborhood(el, nb)).toBe(true)
  })

  it('returns false for an element fully outside the neighborhood', () => {
    // Clearly outside on the right: neighborhood ends at x=200, desk at
    // x=300 with bounds 280..320.
    const el = desk({ x: 300, y: 100 })
    expect(elementInNeighborhood(el, nb)).toBe(false)
  })

  it('returns false for an element fully outside on the Y axis', () => {
    const el = desk({ x: 100, y: 500 })
    expect(elementInNeighborhood(el, nb)).toBe(false)
  })

  it('returns false for a zero-size element', () => {
    const el = desk({ width: 0, height: 0, x: 100, y: 100 })
    expect(elementInNeighborhood(el, nb)).toBe(false)
  })
})

describe('getElementsInNeighborhood', () => {
  it('filters a mixed list down to contained elements only', () => {
    const inside = desk({ id: 'a', x: 100, y: 100 })
    const straddle = desk({ id: 'b', x: 200, y: 100 })
    const outside = desk({ id: 'c', x: 500, y: 500 })
    const result = getElementsInNeighborhood([inside, straddle, outside], nb)
    const ids = result.map((e) => e.id).sort()
    expect(ids).toEqual(['a', 'b'])
  })

  it('accepts a record map as well as an array', () => {
    const elements: Record<string, CanvasElement> = {
      a: desk({ id: 'a', x: 100, y: 100 }),
      b: desk({ id: 'b', x: 500, y: 500 }),
    }
    const result = getElementsInNeighborhood(elements, nb)
    expect(result.map((e) => e.id)).toEqual(['a'])
  })
})
