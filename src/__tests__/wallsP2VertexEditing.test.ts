/**
 * Tests for the P2 wall-vertex-editing affordances:
 *
 *   1. `addVertexAt` splits a straight segment cleanly.
 *   2. `addVertexAt` splits a curved segment with halved bulges so the
 *      visible arc continues through the new vertex.
 *   3. `findNearestPointOnWallEdge` projects the cursor to the nearest
 *      polyline point and respects a tolerance (caller-side gating, but
 *      the helper returns the distance the caller compares against).
 *   4. `removeVertex` removes the named vertex from a 4-vertex wall.
 *   5. `removeVertex` returns null for a 2-vertex wall (caller must
 *      delete the entire wall).
 *   6. `removeWallVertex` cascade-deletes attached doors whose
 *      `positionOnWall` falls on the removed segment, and pushes an Undo
 *      toast that restores both the wall geometry AND the children.
 *
 * The interactive UI hooks (WallEditOverlay click → setEdgeHover →
 * commitInsertVertex; useKeyboardShortcuts Backspace → removeWallVertex)
 * are exercised in the existing component tests / via integration in
 * downstream PRs. This file targets the pure-helper math + the cascade
 * logic, which is where the geometry bugs live.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { addVertexAt, removeVertex } from '../lib/wallEditing'
import { findNearestPointOnWallEdge } from '../lib/wallSnap'
import { removeWallVertex } from '../lib/seatAssignment'
import { wallSegments } from '../lib/wallPath'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useToastStore } from '../stores/toastStore'
import type { WallElement, DoorElement } from '../types/elements'

function makeWall(partial: Partial<WallElement> = {}): WallElement {
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
    zIndex: 1,
    label: 'Wall',
    visible: true,
    style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
    points: [0, 0, 100, 0],
    bulges: [0],
    thickness: 6,
    wallType: 'solid',
    ...partial,
  }
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useUIStore.setState({ selectedIds: [], activeVertex: null })
  useToastStore.setState({ items: [] })
})

describe('addVertexAt — straight segment', () => {
  it('inserts a new vertex at the projected point, preserving endpoints', () => {
    // Wall is a single horizontal segment from (0,0) to (100,0).
    const wall = makeWall({ points: [0, 0, 100, 0], bulges: [0] })
    const result = addVertexAt(wall, 0, { x: 50, y: 0 })
    expect(result).not.toBeNull()
    expect(result!.wall.points).toEqual([0, 0, 50, 0, 100, 0])
    // Both halves of the split straight segment stay straight.
    expect(result!.wall.bulges).toEqual([0, 0])
    // The newly-inserted vertex is at index 1 (between the two original
    // vertices). The contract says callers can immediately mark it active.
    expect(result!.insertedVertexIndex).toBe(1)
  })

  it('returns null for an out-of-range segment index', () => {
    const wall = makeWall({ points: [0, 0, 100, 0], bulges: [0] })
    expect(addVertexAt(wall, -1, { x: 50, y: 0 })).toBeNull()
    expect(addVertexAt(wall, 1, { x: 50, y: 0 })).toBeNull()
  })

  it('inserts in the right slot when the wall has multiple existing segments', () => {
    // Wall: (0,0)-(100,0)-(200,0)-(300,0). Insert into segment 1 at (150, 0).
    const wall = makeWall({
      points: [0, 0, 100, 0, 200, 0, 300, 0],
      bulges: [0, 0, 0],
    })
    const result = addVertexAt(wall, 1, { x: 150, y: 0 })
    expect(result).not.toBeNull()
    expect(result!.wall.points).toEqual([0, 0, 100, 0, 150, 0, 200, 0, 300, 0])
    expect(result!.wall.bulges).toEqual([0, 0, 0, 0])
    expect(result!.insertedVertexIndex).toBe(2)
  })
})

describe('addVertexAt — curved segment', () => {
  it('splits a curved segment into two sub-segments with halved bulges', () => {
    // Single curved segment with bulge 20 (legal: |20| < chord/2 = 50).
    const wall = makeWall({ points: [0, 0, 100, 0], bulges: [20] })
    const result = addVertexAt(wall, 0, { x: 50, y: 0 })
    expect(result).not.toBeNull()
    // Each half inherits exactly half the original bulge so the split
    // visually continues the curvature (rationale documented in the
    // helper's JSDoc).
    expect(result!.wall.bulges).toEqual([10, 10])
  })

  it('preserves bulges of unrelated segments when splitting one mid-wall', () => {
    // Three segments: straight, curved, straight. Split the curved one.
    const wall = makeWall({
      points: [0, 0, 100, 0, 200, 0, 300, 0],
      bulges: [0, 30, 0],
    })
    const result = addVertexAt(wall, 1, { x: 150, y: 0 })
    expect(result).not.toBeNull()
    // The first and last bulges stay 0; the middle splits into [15, 15].
    expect(result!.wall.bulges).toEqual([0, 15, 15, 0])
  })
})

describe('findNearestPointOnWallEdge', () => {
  it('projects a cursor near the segment to its closest polyline point', () => {
    // Horizontal segment from (0,0) to (100,0). Cursor at (50, 5).
    const segs = wallSegments([0, 0, 100, 0], [0])
    const hit = findNearestPointOnWallEdge(segs, 50, 5)
    expect(hit).not.toBeNull()
    expect(hit!.x).toBe(50)
    expect(hit!.y).toBe(0)
    expect(hit!.distance).toBeCloseTo(5, 6)
    expect(hit!.segmentIndex).toBe(0)
  })

  it('returns the distance so callers can apply their own tolerance', () => {
    // Cursor at (50, 20) — far from the chord. Helper STILL returns the
    // hit; the snap-tolerance check happens in the overlay/CanvasStage
    // (compares `distance` against `EDGE_SNAP_PX / stageScale`). Tested
    // here so a future refactor can't quietly add an internal threshold.
    const segs = wallSegments([0, 0, 100, 0], [0])
    const hit = findNearestPointOnWallEdge(segs, 50, 20)
    expect(hit).not.toBeNull()
    expect(hit!.distance).toBeCloseTo(20, 6)
  })

  it('clamps t to [0, 1] when the cursor projects beyond the segment', () => {
    const segs = wallSegments([0, 0, 100, 0], [0])
    // Cursor at (-50, 0) → projects to (0, 0).
    const hit = findNearestPointOnWallEdge(segs, -50, 0)
    expect(hit!.x).toBe(0)
    expect(hit!.t).toBe(0)
    // Cursor at (200, 0) → projects to (100, 0).
    const hit2 = findNearestPointOnWallEdge(segs, 200, 0)
    expect(hit2!.x).toBe(100)
    expect(hit2!.t).toBe(1)
  })

  it('returns null when the polyline has no segments', () => {
    expect(findNearestPointOnWallEdge([], 50, 5)).toBeNull()
  })
})

describe('removeVertex', () => {
  it('removes an interior vertex from a 4-vertex wall and collapses adjacent segments', () => {
    // Wall: (0,0)-(50,0)-(100,0)-(150,0). Remove vertex 1.
    const wall = makeWall({
      points: [0, 0, 50, 0, 100, 0, 150, 0],
      bulges: [0, 0, 0],
    })
    const updated = removeVertex(wall, 1)
    expect(updated).not.toBeNull()
    expect(updated!.points).toEqual([0, 0, 100, 0, 150, 0])
    expect(updated!.bulges).toEqual([0, 0])
  })

  it('removes the first vertex by dropping the leading segment', () => {
    const wall = makeWall({
      points: [0, 0, 50, 0, 100, 0],
      bulges: [10, 0],
    })
    const updated = removeVertex(wall, 0)
    expect(updated!.points).toEqual([50, 0, 100, 0])
    // Segment 0 (the curved one entering vertex 1) is gone; the surviving
    // segment is the originally-straight one.
    expect(updated!.bulges).toEqual([0])
  })

  it('removes the last vertex by dropping the trailing segment', () => {
    const wall = makeWall({
      points: [0, 0, 50, 0, 100, 0],
      bulges: [0, 10],
    })
    const updated = removeVertex(wall, 2)
    expect(updated!.points).toEqual([0, 0, 50, 0])
    expect(updated!.bulges).toEqual([0])
  })

  it('returns null when removal would reduce the wall to a single vertex', () => {
    // 2-vertex wall: pulling either vertex leaves a degenerate point.
    const wall = makeWall({ points: [0, 0, 100, 0], bulges: [0] })
    expect(removeVertex(wall, 0)).toBeNull()
    expect(removeVertex(wall, 1)).toBeNull()
  })

  it('collapses interior arcs into a straight segment (no auto-merge of curves)', () => {
    // Two curved segments (bulge 10 each); interior vertex removal collapses
    // both into ONE segment, intentionally straight (rationale: the user
    // asked for simpler geometry, not a re-fit arc through three points).
    const wall = makeWall({
      points: [0, 0, 50, 0, 100, 0],
      bulges: [10, 10],
    })
    const updated = removeVertex(wall, 1)
    expect(updated!.bulges).toEqual([0])
  })
})

describe('removeWallVertex (cascade + toast)', () => {
  it('cascade-deletes a door whose positionOnWall falls on the removed segment', () => {
    // 3-vertex straight wall, total straight length 200. Vertex 1 splits
    // it 50/150 — segment 0 length 50, segment 1 length 150. positionOnWall
    // 0.7 → 140 → falls on segment 1 (50 to 200). Removing vertex 1
    // collapses segments 0 and 1 → both originals are gone → door is
    // cascade-deleted.
    const wall = makeWall({
      id: 'w1',
      points: [0, 0, 50, 0, 200, 0],
      bulges: [0, 0],
    })
    const door: DoorElement = {
      id: 'd1',
      type: 'door',
      x: 0,
      y: 0,
      width: 30,
      height: 6,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: 2,
      label: 'Door',
      visible: true,
      style: { fill: '#fff', stroke: '#111827', strokeWidth: 1, opacity: 1 },
      parentWallId: 'w1',
      positionOnWall: 0.7,
      swingDirection: 'left',
      openAngle: 90,
    }
    useElementsStore.setState({ elements: { w1: wall, d1: door } })

    removeWallVertex('w1', 1)

    const elements = useElementsStore.getState().elements
    // Wall geometry collapsed to two-vertex straight wall.
    expect((elements.w1 as WallElement).points).toEqual([0, 0, 200, 0])
    // Door cascade-deleted.
    expect(elements.d1).toBeUndefined()
    // Toast pushed with Undo action.
    const toasts = useToastStore.getState().items
    expect(toasts.length).toBe(1)
    expect(toasts[0].title).toMatch(/Vertex.*1.*attached element.*removed/)
    expect(toasts[0].action?.label).toBe('Undo')
  })

  it('Undo restores both the wall geometry and the cascaded child', () => {
    const wall = makeWall({
      id: 'w1',
      points: [0, 0, 50, 0, 200, 0],
      bulges: [0, 0],
    })
    const door: DoorElement = {
      id: 'd1',
      type: 'door',
      x: 0,
      y: 0,
      width: 30,
      height: 6,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: 2,
      label: 'Door',
      visible: true,
      style: { fill: '#fff', stroke: '#111827', strokeWidth: 1, opacity: 1 },
      parentWallId: 'w1',
      positionOnWall: 0.7,
      swingDirection: 'left',
      openAngle: 90,
    }
    useElementsStore.setState({ elements: { w1: wall, d1: door } })

    removeWallVertex('w1', 1)
    const toast = useToastStore.getState().items[0]
    // Click Undo — should restore both records.
    toast.action!.onClick()
    const restored = useElementsStore.getState().elements
    expect((restored.w1 as WallElement).points).toEqual([0, 0, 50, 0, 200, 0])
    expect(restored.d1).toBeDefined()
  })

  it('falls back to deleteElements when the wall would become a single vertex', () => {
    // 2-vertex wall: removeVertex returns null → removeWallVertex deletes
    // the wall entirely via the existing deleteElements cascade path.
    const wall = makeWall({ id: 'w1', points: [0, 0, 100, 0], bulges: [0] })
    useElementsStore.setState({ elements: { w1: wall } })
    removeWallVertex('w1', 0)
    expect(useElementsStore.getState().elements.w1).toBeUndefined()
  })

  it('does not push a toast when no children were cascaded', () => {
    const wall = makeWall({
      id: 'w1',
      points: [0, 0, 50, 0, 100, 0],
      bulges: [0, 0],
    })
    useElementsStore.setState({ elements: { w1: wall } })
    removeWallVertex('w1', 1)
    // Wall geometry changed (3 → 2 vertices), but no attached elements
    // existed → no toast (the geometry change is its own visual feedback).
    expect(useToastStore.getState().items.length).toBe(0)
    expect((useElementsStore.getState().elements.w1 as WallElement).points)
      .toEqual([0, 0, 100, 0])
  })
})
