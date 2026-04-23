import { describe, it, expect, beforeEach } from 'vitest'
import {
  getSnappedPosition,
  findAlignmentGuides,
  snapRotation,
  type Rect,
} from '../lib/geometry'
import { useUIStore } from '../stores/uiStore'

/**
 * Snap + rotation-snap math is pure — the Konva side of the feature
 * (onDragMove in ElementRenderer, rotationSnaps on the Transformer) is
 * essentially plumbing. These tests lock in the pure logic and the ui-
 * store drag-guide slice that the plumbing reads from.
 */

describe('getSnappedPosition — drag snapping', () => {
  const movingSize = { width: 60, height: 40 }
  const threshold = 5

  it('snaps left edge to another rect left edge when within threshold', () => {
    const others: Rect[] = [{ x: 100, y: 0, width: 60, height: 40 }]
    // Moving top-left at x=97 (3 px off the other's left=100) → snap to 100.
    const { snapped, guides } = getSnappedPosition(
      { x: 97, y: 0 },
      others,
      movingSize,
      threshold,
    )
    expect(snapped.x).toBe(100)
    expect(guides.some((g) => g.orientation === 'vertical' && g.position === 100)).toBe(true)
  })

  it('snaps center-to-center on the vertical axis', () => {
    // Other centered at x=200 (rect 170..230, center=200). Moving width=60
    // → pos.x + 30 should be 200 → pos.x = 170. Start at 172 (2px off).
    const others: Rect[] = [{ x: 170, y: 0, width: 60, height: 40 }]
    const { snapped, guides } = getSnappedPosition(
      { x: 172, y: 50 },
      others,
      movingSize,
      threshold,
    )
    expect(snapped.x).toBe(170)
    expect(guides.some((g) => g.orientation === 'vertical' && g.position === 200)).toBe(true)
  })

  it('leaves position untouched when no other rect is within threshold', () => {
    const others: Rect[] = [{ x: 500, y: 500, width: 60, height: 40 }]
    const { snapped, guides } = getSnappedPosition(
      { x: 10, y: 10 },
      others,
      movingSize,
      threshold,
    )
    expect(snapped).toEqual({ x: 10, y: 10 })
    expect(guides.length).toBe(0)
  })

  it('snaps top edge to another rect top edge', () => {
    const others: Rect[] = [{ x: 0, y: 200, width: 60, height: 40 }]
    const { snapped } = getSnappedPosition(
      { x: 0, y: 198 },
      others,
      movingSize,
      threshold,
    )
    expect(snapped.y).toBe(200)
  })
})

describe('findAlignmentGuides — guide emission', () => {
  it('emits vertical center guide when centers align', () => {
    const moving: Rect = { x: 170, y: 0, width: 60, height: 40 }
    const other: Rect = { x: 170, y: 200, width: 60, height: 40 }
    const guides = findAlignmentGuides(moving, [other], 5)
    expect(
      guides.some((g) => g.orientation === 'vertical' && g.position === 200),
    ).toBe(true)
  })

  it('emits nothing when rects are far apart', () => {
    const moving: Rect = { x: 0, y: 0, width: 10, height: 10 }
    const other: Rect = { x: 1000, y: 1000, width: 10, height: 10 }
    expect(findAlignmentGuides(moving, [other], 5).length).toBe(0)
  })
})

describe('snapRotation — 45° cardinal snap', () => {
  it('snaps 2° to 0°', () => {
    expect(snapRotation(2, 45)).toBe(0)
  })
  it('snaps 46° to 45°', () => {
    expect(snapRotation(46, 45)).toBe(45)
  })
  it('snaps 88° to 90°', () => {
    expect(snapRotation(88, 45)).toBe(90)
  })
  it('is identity on exact snap values', () => {
    for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
      expect(snapRotation(a, 45)).toBe(a)
    }
  })
})

describe('uiStore.dragAlignmentGuides — live overlay slice', () => {
  beforeEach(() => {
    useUIStore.getState().clearDragAlignmentGuides()
  })

  it('starts empty', () => {
    expect(useUIStore.getState().dragAlignmentGuides).toEqual([])
  })

  it('setDragAlignmentGuides replaces the list', () => {
    useUIStore.getState().setDragAlignmentGuides([
      { orientation: 'vertical', position: 10, start: 0, end: 100 },
    ])
    expect(useUIStore.getState().dragAlignmentGuides.length).toBe(1)
    useUIStore.getState().setDragAlignmentGuides([])
    expect(useUIStore.getState().dragAlignmentGuides.length).toBe(0)
  })

  it('clearDragAlignmentGuides empties the list', () => {
    useUIStore.getState().setDragAlignmentGuides([
      { orientation: 'horizontal', position: 50, start: 0, end: 200 },
      { orientation: 'vertical', position: 60, start: 0, end: 200 },
    ])
    useUIStore.getState().clearDragAlignmentGuides()
    expect(useUIStore.getState().dragAlignmentGuides).toEqual([])
  })
})
