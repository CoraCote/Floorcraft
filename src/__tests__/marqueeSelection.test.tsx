import { describe, it, expect } from 'vitest'
import { elementsIntersectingRect } from '../lib/marquee'
import type {
  CanvasElement,
  DeskElement,
  WallElement,
  DecorElement,
} from '../types/elements'

// The marquee hit-test is pure and deterministic — test it directly rather
// than going through the full CanvasStage mount, which would require a
// router/providers + the Konva Stage itself.

function desk(id: string, x: number, y: number): DeskElement {
  return {
    id, type: 'desk',
    x, y, width: 60, height: 40, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Desk', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: id, assignedEmployeeId: null, capacity: 1,
  }
}

function wall(id: string, points: number[]): WallElement {
  return {
    id, type: 'wall',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Wall', visible: true,
    style: { fill: '#000', stroke: '#111', strokeWidth: 4, opacity: 1 },
    points, thickness: 4, connectedWallIds: [], wallType: 'solid',
  }
}

function hidden(id: string): DecorElement {
  return {
    id, type: 'decor', shape: 'armchair',
    x: 0, y: 0, width: 20, height: 20, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'H', visible: false,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  }
}

describe('elementsIntersectingRect (marquee hit-test)', () => {
  it('selects elements whose AABB overlaps the marquee', () => {
    const a = desk('a', 50, 50)    // bbox: 20..80, 30..70
    const b = desk('b', 200, 200)  // bbox: 170..230, 180..220
    const c = desk('c', 100, 100)  // bbox: 70..130, 80..120
    const elements: Record<string, CanvasElement> = { a, b, c }

    // Rect covering a and c but missing b.
    const hits = elementsIntersectingRect(elements, { x: 0, y: 0, w: 150, h: 150 })
    expect(hits.sort()).toEqual(['a', 'c'])
  })

  it('uses center-origin coords for non-wall elements', () => {
    const a = desk('a', 100, 100) // bbox center-origin: 70..130, 80..120
    const elements: Record<string, CanvasElement> = { a }
    // Rect that only covers the top-left corner of the AABB.
    expect(
      elementsIntersectingRect(elements, { x: 65, y: 75, w: 10, h: 10 }),
    ).toEqual(['a'])
    // Rect just outside the AABB → no hit.
    expect(
      elementsIntersectingRect(elements, { x: 0, y: 0, w: 50, h: 50 }),
    ).toEqual([])
  })

  it('uses points-array AABB for walls', () => {
    const w = wall('w1', [10, 10, 100, 10, 100, 80])
    const elements: Record<string, CanvasElement> = { w }
    // Rect touching wall bbox (10..100, 10..80)
    expect(
      elementsIntersectingRect(elements, { x: 95, y: 70, w: 20, h: 20 }),
    ).toEqual(['w1'])
    // Rect far from wall
    expect(
      elementsIntersectingRect(elements, { x: 200, y: 200, w: 20, h: 20 }),
    ).toEqual([])
  })

  it('excludes hidden elements', () => {
    const h = hidden('h')
    const elements: Record<string, CanvasElement> = { h }
    expect(
      elementsIntersectingRect(elements, { x: -100, y: -100, w: 1000, h: 1000 }),
    ).toEqual([])
  })
})
