import { describe, it, expect, beforeEach, vi } from 'vitest'
import { alignElements, distributeElements } from '../lib/alignment'
import { useElementsStore } from '../stores/elementsStore'
import type { DeskElement, WallElement, CanvasElement } from '../types/elements'

function desk(id: string, x: number, y: number, w = 60, h = 40): DeskElement {
  return {
    id, type: 'desk',
    x, y, width: w, height: h, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Desk', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: id, assignedEmployeeId: null, capacity: 1,
  }
}

function wall(id: string): WallElement {
  return {
    id, type: 'wall',
    x: 0, y: 0, width: 0, height: 0, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Wall', visible: true,
    style: { fill: '#000', stroke: '#111', strokeWidth: 4, opacity: 1 },
    points: [0, 0, 100, 0],
    thickness: 4, connectedWallIds: [], wallType: 'solid',
  }
}

function seed(els: CanvasElement[]) {
  const map: Record<string, CanvasElement> = {}
  for (const e of els) map[e.id] = e
  useElementsStore.setState({ elements: map })
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
})

describe('alignElements', () => {
  it('left-aligns every element to the selection minX + halfWidth', () => {
    // a.left = 50-30 = 20, b.left = 150-30 = 120, c.left = 200-30 = 170
    // minX = 20 → new x = 20 + 30 = 50 for all.
    const a = desk('a', 50, 0)
    const b = desk('b', 150, 100)
    const c = desk('c', 200, 200)
    seed([a, b, c])

    alignElements(['a', 'b', 'c'], 'left')

    const els = useElementsStore.getState().elements
    expect(els.a.x).toBe(50)
    expect(els.b.x).toBe(50)
    expect(els.c.x).toBe(50)
  })

  it('right-aligns every element to maxX - halfWidth', () => {
    const a = desk('a', 50, 0)
    const b = desk('b', 150, 100)
    const c = desk('c', 200, 200)
    seed([a, b, c])
    // maxX = 200+30 = 230 → new x = 230-30 = 200
    alignElements(['a', 'b', 'c'], 'right')
    const els = useElementsStore.getState().elements
    expect(els.a.x).toBe(200)
    expect(els.b.x).toBe(200)
    expect(els.c.x).toBe(200)
  })

  it('top-aligns to minY + halfHeight', () => {
    const a = desk('a', 0, 50)
    const b = desk('b', 0, 150)
    seed([a, b])
    // minY = 50-20 = 30 → new y = 30+20 = 50
    alignElements(['a', 'b'], 'top')
    const els = useElementsStore.getState().elements
    expect(els.a.y).toBe(50)
    expect(els.b.y).toBe(50)
  })

  it('horizontal center aligns every element to (minX+maxX)/2', () => {
    const a = desk('a', 50, 0)
    const b = desk('b', 200, 100)
    seed([a, b])
    // minX=20, maxX=230 → center = 125
    alignElements(['a', 'b'], 'h-center')
    const els = useElementsStore.getState().elements
    expect(els.a.x).toBe(125)
    expect(els.b.x).toBe(125)
  })

  it('skips walls and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = desk('a', 50, 0)
    const b = desk('b', 150, 100)
    const w = wall('w')
    seed([a, b, w])
    alignElements(['a', 'b', 'w'], 'left')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('is a no-op with fewer than 2 elements', () => {
    const a = desk('a', 50, 0)
    seed([a])
    alignElements(['a'], 'left')
    expect(useElementsStore.getState().elements.a.x).toBe(50)
  })
})

describe('distributeElements', () => {
  it('evenly distributes interior elements horizontally', () => {
    const a = desk('a', 0, 0)
    const b = desk('b', 30, 0) // uneven — should snap to midpoint
    const c = desk('c', 100, 0)
    seed([a, b, c])

    distributeElements(['a', 'b', 'c'], 'horizontal')

    const els = useElementsStore.getState().elements
    expect(els.a.x).toBe(0) // endpoint unchanged
    expect(els.c.x).toBe(100) // endpoint unchanged
    expect(els.b.x).toBe(50) // midpoint
  })

  it('is a no-op with fewer than 3 elements', () => {
    const a = desk('a', 0, 0)
    const b = desk('b', 30, 0)
    seed([a, b])
    distributeElements(['a', 'b'], 'horizontal')
    expect(useElementsStore.getState().elements.b.x).toBe(30)
  })
})
