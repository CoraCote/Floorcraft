import { describe, it, expect, beforeEach } from 'vitest'
import { applyVertexMove, applyBulgeFromDrag, clampBulge, signedPerpOffset } from '../lib/wallEditing'
import { useElementsStore } from '../stores/elementsStore'
import type { WallElement } from '../types/elements'

function seedWall(partial: Partial<WallElement> = {}): WallElement {
  const w: WallElement = {
    id: 'w1',
    type: 'wall',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Wall',
    visible: true,
    style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
    points: [0, 0, 100, 0, 200, 0],
    bulges: [0, 0],
    thickness: 6,
    connectedWallIds: [],
    ...partial,
  }
  useElementsStore.setState({ elements: { [w.id]: w } })
  return w
}

describe('signedPerpOffset', () => {
  it('returns 0 for degenerate chord', () => {
    expect(signedPerpOffset(0, 0, 0, 0, 5, 5)).toBe(0)
  })
  it('is positive for pointer above a left-to-right chord', () => {
    // chord along +X, point at (50, -10) is visually "above" in screen coords
    expect(signedPerpOffset(0, 0, 100, 0, 50, -10)).toBeGreaterThan(0)
  })
})

describe('clampBulge', () => {
  it('snaps tiny raw values to 0 via deadzone', () => {
    expect(clampBulge(1.5, 100)).toBe(0)
  })
  it('clamps |bulge| to chord/2', () => {
    expect(clampBulge(500, 100)).toBeCloseTo(50, 6)
    expect(clampBulge(-500, 100)).toBeCloseTo(-50, 6)
  })
  it('rounds to 2 decimals', () => {
    expect(clampBulge(12.3456, 100)).toBe(12.35)
  })
})

describe('applyVertexMove', () => {
  beforeEach(() => {
    useElementsStore.setState({ elements: {} })
  })

  it('moves the named vertex without touching others', () => {
    seedWall()
    applyVertexMove('w1', 1, { x: 150, y: 20 })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.points[0]).toBe(0)
    expect(w.points[1]).toBe(0)
    expect(w.points[2]).toBe(150)
    expect(w.points[3]).toBe(20)
    expect(w.points[4]).toBe(200)
    expect(w.points[5]).toBe(0)
  })

  it('preserves straight-segment bulges (0 stays 0) when vertex moves', () => {
    seedWall({ bulges: [0, 0] })
    applyVertexMove('w1', 1, { x: 10, y: 10 })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.bulges).toEqual([0, 0])
  })

  it('re-clamps an adjacent bulge when the move shortens the chord below 2*bulge', () => {
    // Segment 0 is (0,0) -> (100,0), chord=100, bulge=40 (legal: |40|<=50)
    seedWall({ points: [0, 0, 100, 0, 200, 0], bulges: [40, 0] })
    // Move vertex 1 to (30, 0). New chord for seg 0 = 30 → legal max = 15.
    applyVertexMove('w1', 1, { x: 30, y: 0 })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.points[2]).toBe(30)
    // bulge must have been re-clamped to chord/2
    expect(w.bulges![0]).toBeCloseTo(15, 6)
  })

  it('re-clamps the bulge on the segment entering the moved vertex too', () => {
    // Move vertex 2 (end) — seg 1 is (100,0)->(200,0), chord=100, bulge=40.
    seedWall({ points: [0, 0, 100, 0, 200, 0], bulges: [0, 40] })
    applyVertexMove('w1', 2, { x: 140, y: 0 })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    // New seg 1 chord = 40 → clamp to 20.
    expect(w.bulges![1]).toBeCloseTo(20, 6)
    // seg 0 was not adjacent to vertex 2 in a way that shortened its chord,
    // so its bulge stays 0.
    expect(w.bulges![0]).toBe(0)
  })

  it('no-ops on unknown element id', () => {
    seedWall()
    applyVertexMove('does-not-exist', 0, { x: 1, y: 1 })
    // existing wall unchanged
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.points).toEqual([0, 0, 100, 0, 200, 0])
  })
})

describe('applyBulgeFromDrag', () => {
  beforeEach(() => {
    useElementsStore.setState({ elements: {} })
  })

  it('patches a single segment bulge without touching the others', () => {
    seedWall({ bulges: [0, 0] })
    applyBulgeFromDrag('w1', 1, { x: 150, y: -30 })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.bulges![0]).toBe(0)
    expect(w.bulges![1]).not.toBe(0)
  })

  it('no-ops on unknown element id', () => {
    seedWall()
    applyBulgeFromDrag('nope', 0, { x: 10, y: -10 })
    const w = useElementsStore.getState().elements['w1'] as WallElement
    expect(w.bulges).toEqual([0, 0])
  })
})
