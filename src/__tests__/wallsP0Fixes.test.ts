import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { translateWall, applyVertexMove } from '../lib/wallEditing'
import { useWallDrawing } from '../hooks/useWallDrawing'
import { useElementsStore } from '../stores/elementsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useToastStore } from '../stores/toastStore'
import { deleteElements } from '../lib/seatAssignment'
import { lockToCardinal } from '../lib/wallSnap'
import type {
  WallElement,
  DoorElement,
  WindowElement,
} from '../types/elements'

function makeWall(
  id: string,
  points: number[],
  bulges?: number[],
): WallElement {
  return {
    id,
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
    points,
    bulges: bulges ?? Array.from({ length: points.length / 2 - 1 }, () => 0),
    thickness: 6,
    connectedWallIds: [],
    wallType: 'solid',
  }
}

function makeDoor(id: string, parentWallId: string, t = 0.5): DoorElement {
  return {
    id,
    type: 'door',
    x: 0,
    y: 0,
    width: 32,
    height: 6,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 2,
    label: 'Door',
    visible: true,
    style: { fill: '#fff', stroke: '#111', strokeWidth: 2, opacity: 1 },
    parentWallId,
    positionOnWall: t,
    swingDirection: 'left',
    openAngle: 90,
  }
}

function makeWindow(id: string, parentWallId: string, t = 0.25): WindowElement {
  return {
    id,
    type: 'window',
    x: 0,
    y: 0,
    width: 24,
    height: 6,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 2,
    label: 'Window',
    visible: true,
    style: { fill: '#cdd', stroke: '#111', strokeWidth: 2, opacity: 1 },
    parentWallId,
    positionOnWall: t,
  }
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {} })
  useToastStore.setState({ items: [] })
  useCanvasStore.setState((s) => ({
    activeTool: 'wall',
    stageScale: 1,
    settings: { ...s.settings, showGrid: false, gridSize: 20 },
  }))
})

describe('Fix 1 — translateWall: walls actually drag', () => {
  it('translates every vertex by (dx, dy)', () => {
    const wall = makeWall('w1', [0, 0, 100, 0])
    useElementsStore.setState({ elements: { w1: wall } })
    translateWall('w1', 50, 30)
    const result = useElementsStore.getState().elements['w1'] as WallElement
    expect(result.points).toEqual([50, 30, 150, 30])
    // The wall's x/y stay at 0 — the renderer ignores them for walls.
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('translates a multi-segment wall uniformly, including curved segments', () => {
    // 3-vertex wall with a bulge in the middle segment.
    const wall = makeWall('w1', [0, 0, 100, 0, 200, 0], [0, 15])
    useElementsStore.setState({ elements: { w1: wall } })
    translateWall('w1', 25, -25)
    const result = useElementsStore.getState().elements['w1'] as WallElement
    expect(result.points).toEqual([25, -25, 125, -25, 225, -25])
    // Bulges must NOT change — chord lengths are preserved by a rigid
    // translation, so the existing bulge values stay legal.
    expect(result.bulges).toEqual([0, 15])
  })

  it('a door attached to a translated wall ends up at the new world position', () => {
    // Wall along X axis, door at the midpoint (positionOnWall = 0.5).
    const wall = makeWall('w1', [0, 0, 100, 0])
    const door = makeDoor('d1', 'w1', 0.5)
    useElementsStore.setState({ elements: { w1: wall, d1: door } })

    translateWall('w1', 40, 20)

    const result = useElementsStore.getState().elements['w1'] as WallElement
    // The door's resolved world position is wall.points midpoint:
    // before: ((0+100)/2, (0+0)/2) = (50, 0)
    // after:  ((40+140)/2, (20+20)/2) = (90, 20)
    // Difference: (40, 20) — exactly the translation delta.
    const before = { x: 50, y: 0 }
    const x0 = result.points[0]
    const y0 = result.points[1]
    const x1 = result.points[2]
    const y1 = result.points[3]
    const after = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
    expect(after.x - before.x).toBe(40)
    expect(after.y - before.y).toBe(20)
  })

  it('is a no-op for zero delta', () => {
    const wall = makeWall('w1', [0, 0, 100, 0])
    useElementsStore.setState({ elements: { w1: wall } })
    translateWall('w1', 0, 0)
    expect(
      (useElementsStore.getState().elements['w1'] as WallElement).points,
    ).toEqual([0, 0, 100, 0])
  })
})

describe('Fix 2 — endpoint snap during wall drawing', () => {
  it('snaps a click within radius of an existing wall vertex onto that vertex', () => {
    // Existing wall has an endpoint at (100, 100). The new wall's first
    // click lands at (105, 102) — within ENDPOINT_SNAP_PX (10) at 1× zoom.
    useElementsStore.setState({
      elements: { w0: makeWall('w0', [100, 100, 200, 100]) },
    })
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(105, 102)
      result.current.handleCanvasMouseUp(105, 102)
    })
    const session = result.current.wallDrawingState
    // The first committed vertex should snap exactly to (100, 100).
    expect(session.points.slice(0, 2)).toEqual([100, 100])
  })

  it('falls back to free coordinates when no vertex is in range and grid is off', () => {
    useElementsStore.setState({
      elements: { w0: makeWall('w0', [100, 100, 200, 100]) },
    })
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(150, 100)
      result.current.handleCanvasMouseUp(150, 100)
    })
    const session = result.current.wallDrawingState
    expect(session.points.slice(0, 2)).toEqual([150, 100])
  })

  it('falls back to grid snap when no endpoint is in range and grid is on', () => {
    useCanvasStore.setState((s) => ({
      settings: { ...s.settings, showGrid: true, gridSize: 20 },
    }))
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(33, 47)
      result.current.handleCanvasMouseUp(33, 47)
    })
    const session = result.current.wallDrawingState
    // 33 → 40, 47 → 40 (both round to nearest 20).
    expect(session.points.slice(0, 2)).toEqual([40, 40])
  })

  it('vertex drag also snaps to nearby existing endpoints', () => {
    // Two walls; the user drags vertex 1 of wall A near wall B's endpoint.
    useElementsStore.setState({
      elements: {
        a: makeWall('a', [0, 0, 50, 0]),
        b: makeWall('b', [100, 0, 200, 0]),
      },
    })
    // Drag vertex 1 of wall A from (50, 0) toward (98, 1) — within
    // ENDPOINT_SNAP_PX of wall B's endpoint (100, 0).
    applyVertexMove('a', 1, { x: 98, y: 1 })
    const a = useElementsStore.getState().elements['a'] as WallElement
    expect(a.points).toEqual([0, 0, 100, 0])
  })
})

describe('Fix 3 — cardinal angle lock', () => {
  it('lockToCardinal projects a near-horizontal vector exactly horizontal', () => {
    // Anchor at (0, 0), candidate at (120, 30) — 14° off the X axis,
    // closer to 0° than to 45°.
    expect(lockToCardinal(0, 0, 120, 30)).toEqual({
      x: expect.closeTo(123.69, 1) as unknown as number,
      y: 0,
    })
  })

  it('lockToCardinal projects a near-diagonal vector to 45°', () => {
    // (90, 100) is closest to 45°.
    const r = lockToCardinal(0, 0, 90, 100)
    expect(r.x).toBeCloseTo(r.y, 5)
  })

  it('Shift held during drawing locks the committed vertex', () => {
    // First click at (0, 0). Second mouseup at (120, 30) with Shift held.
    // Expected committed point: (~123.69, 0) — horizontal projection.
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
    })
    act(() => {
      result.current.handleCanvasMouseDown(120, 30)
      result.current.handleCanvasMouseUp(120, 30, true /* shiftKey */)
    })
    const session = result.current.wallDrawingState
    // Second vertex Y should be 0 (cardinal lock to horizontal).
    expect(session.points[3]).toBe(0)
    // And X should be the projected magnitude (sqrt(120² + 30²) ≈ 123.69).
    expect(session.points[2]).toBeCloseTo(Math.hypot(120, 30), 1)
  })

  it('Shift NOT held leaves the committed vertex at the raw coords', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
    })
    act(() => {
      result.current.handleCanvasMouseDown(120, 30)
      result.current.handleCanvasMouseUp(120, 30, false)
    })
    expect(result.current.wallDrawingState.points).toEqual([0, 0, 120, 30])
  })
})

describe('Fix 4 — cascade-delete toast for walls with attachments', () => {
  it('removes wall and attached doors/windows from the store', () => {
    const wall = makeWall('w1', [0, 0, 100, 0])
    const door1 = makeDoor('d1', 'w1', 0.25)
    const door2 = makeDoor('d2', 'w1', 0.75)
    useElementsStore.setState({ elements: { w1: wall, d1: door1, d2: door2 } })

    deleteElements(['w1'])

    const els = useElementsStore.getState().elements
    expect(els.w1).toBeUndefined()
    expect(els.d1).toBeUndefined()
    expect(els.d2).toBeUndefined()
  })

  it('pushes one info-tone toast with an Undo action when cascade happens', () => {
    const wall = makeWall('w1', [0, 0, 100, 0])
    const door1 = makeDoor('d1', 'w1')
    const door2 = makeDoor('d2', 'w1')
    useElementsStore.setState({ elements: { w1: wall, d1: door1, d2: door2 } })

    deleteElements(['w1'])

    const items = useToastStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].tone).toBe('info')
    expect(items[0].action?.label).toBe('Undo')
    expect(items[0].title).toContain('2')
  })

  it('does NOT push a toast when deleting a wall with no attachments', () => {
    const wall = makeWall('w1', [0, 0, 100, 0])
    useElementsStore.setState({ elements: { w1: wall } })

    deleteElements(['w1'])

    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('Undo restores both the wall and its cascaded children', () => {
    const wall = makeWall('w1', [0, 0, 100, 0])
    const door = makeDoor('d1', 'w1')
    const win = makeWindow('win1', 'w1')
    useElementsStore.setState({ elements: { w1: wall, d1: door, win1: win } })

    deleteElements(['w1'])
    expect(Object.keys(useElementsStore.getState().elements)).toHaveLength(0)

    const toast = useToastStore.getState().items[0]
    expect(toast).toBeDefined()
    toast.action?.onClick()

    const restored = useElementsStore.getState().elements
    expect(restored.w1).toBeDefined()
    expect(restored.d1).toBeDefined()
    expect(restored.win1).toBeDefined()
    // The toast dismisses itself on Undo so the user doesn't get a stale
    // "deleted" notification next to the now-restored wall.
    expect(useToastStore.getState().items).toHaveLength(0)
  })
})
