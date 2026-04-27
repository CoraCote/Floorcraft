/**
 * Tests for the P1 wall-drawing improvements (PR following walls-P0):
 *
 *   1. Live dimension readout (length + angle pill) while drawing.
 *   2. Cardinal lock pill — Shift held shows the locked, not raw, angle.
 *   3. Rectangle/room tool — drag commits 4 connected walls.
 *   4. Rectangle/room tool — single undo rolls back the whole batch.
 *   5. Rectangle/room tool + Shift — output is a square (shorter side wins).
 *   6. Auto-close — clicking near the first vertex closes & finalises.
 *   7. Dead-field cleanup — `WallElement` no longer accepts `connectedWallIds`.
 *
 * The pill rendering is exercised via the helper functions in
 * `src/lib/wallDimensionPill.ts`; the rectangle tool is exercised via the
 * pure helper `buildRoomWalls` (the integration with `CanvasStage`'s
 * mouse handlers is out-of-band; the helper is the load-bearing math).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWallDrawing } from '../hooks/useWallDrawing'
import { useElementsStore } from '../stores/elementsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { buildRoomWalls, squareConstrain } from '../lib/buildRoom'
import {
  formatDimensionPillText,
  cardinalForAngle,
  segmentAngleDeg,
} from '../lib/wallDimensionPill'
import type { WallElement } from '../types/elements'

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  // Clear the zundo history between tests so the "single undo" test
  // doesn't roll back state set in a previous test.
  useElementsStore.temporal.getState().clear()
  useCanvasStore.setState((s) => ({
    activeTool: 'wall',
    stageScale: 1,
    settings: { ...s.settings, showGrid: false, gridSize: 20, scale: 1, scaleUnit: 'px' },
  }))
})

describe('Fix 1 — dimension readout pill', () => {
  it('formatDimensionPillText renders length + angle for a horizontal segment', () => {
    // 100px horizontal segment in 'px' units → "100.0 px\n0° → E".
    const angle = segmentAngleDeg(0, 0, 100, 0)
    const text = formatDimensionPillText(100, angle, 1, 'px')
    expect(text).toBe('100.0 px\n0° → E')
  })

  it('renders the cardinal direction when within 5° of a cardinal', () => {
    // 88° is within 5° of 90° (south).
    expect(cardinalForAngle(88)).toBe('S')
    // 6° is OUTSIDE the 5° tolerance from 0° (east).
    expect(cardinalForAngle(6)).toBe(null)
    // -2° normalised to 358° is within 5° of 0° (east) — the ±360° wrap
    // is what `cardinalForAngle` is supposed to handle so we exercise it
    // explicitly.
    expect(cardinalForAngle(-2)).toBe('E')
  })

  it('formats project-scaled lengths with the configured unit', () => {
    // 12.0 ft means 12px at scale=1, unit=ft.
    const text = formatDimensionPillText(12, 0, 1, 'ft')
    // Length comes first then angle on the second line — assert the
    // first line independently so a future tweak to the angle string
    // doesn't break this formatting check.
    const [lenLine] = text.split('\n')
    expect(lenLine).toBe('12.0 ft')
  })

  it('cardinal lock — when Shift is held during drawing, the pill reflects the locked angle', () => {
    // Click to set first vertex at (0, 0); then second click at (120, 30)
    // with Shift held. The cardinal lock projects (120, 30) onto the
    // horizontal ray from (0, 0), so the LOCKED segment is from (0, 0)
    // to (~123.69, 0) — a pure-east segment (angle 0°). The pill must
    // therefore report 0° → E, not the raw 14° angle.
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
    // The committed vertex is the locked one — Y = 0.
    expect(session.points[3]).toBe(0)
    // The angle of the committed segment is 0° (cardinal east) regardless
    // of where the user clicked. This is what the pill text reads.
    const angle = segmentAngleDeg(
      session.points[0],
      session.points[1],
      session.points[2],
      session.points[3],
    )
    expect(cardinalForAngle(angle)).toBe('E')
  })
})

describe('Fix 2 — rectangle/room tool', () => {
  it('builds 4 connected walls forming a closed rectangle from corners (0,0) and (200,100)', () => {
    const walls = buildRoomWalls({ ax: 0, ay: 0, bx: 200, by: 100 }, 1)
    expect(walls).toHaveLength(4)
    // top: (0,0) → (200,0)
    expect(walls[0].points).toEqual([0, 0, 200, 0])
    // right: (200,0) → (200,100)
    expect(walls[1].points).toEqual([200, 0, 200, 100])
    // bottom: (200,100) → (0,100)
    expect(walls[2].points).toEqual([200, 100, 0, 100])
    // left: (0,100) → (0,0)
    expect(walls[3].points).toEqual([0, 100, 0, 0])
    // The rectangle CLOSES: the last point of wall N is the first point
    // of wall N+1 (mod 4). Verifying this in one assertion makes the
    // "this is a real closed loop" property explicit.
    for (let i = 0; i < 4; i++) {
      const cur = walls[i].points
      const next = walls[(i + 1) % 4].points
      expect(cur.slice(-2)).toEqual(next.slice(0, 2))
    }
    // Each wall is `solid`-typed and has the default thickness.
    for (const w of walls) {
      expect(w.wallType).toBe('solid')
      expect(w.thickness).toBe(6)
    }
  })

  it('rectangle commit is a single undo step — undo removes ALL 4 walls', () => {
    // Simulate the commit path the CanvasStage mouseup handler runs:
    // build walls with `buildRoomWalls`, then `addElements` in one shot.
    const walls = buildRoomWalls({ ax: 0, ay: 0, bx: 200, by: 100 }, 1)
    useElementsStore.getState().addElements(walls)

    const before = Object.keys(useElementsStore.getState().elements)
    expect(before).toHaveLength(4)

    // Single undo via the temporal middleware — same call the editor's
    // Cmd+Z hotkey makes.
    act(() => {
      useElementsStore.temporal.getState().undo()
    })

    const after = Object.keys(useElementsStore.getState().elements)
    expect(after).toHaveLength(0)
  })

  it('Shift held during the rectangle drag — output is a square (shorter side wins)', () => {
    // Drag from (0, 0) toward (300, 100). Without Shift this would commit
    // a 300×100 rectangle. With Shift held the helper snaps to the
    // smaller dimension (100), producing a 100×100 square anchored at
    // the start corner.
    const constrained = squareConstrain({ ax: 0, ay: 0, bx: 300, by: 100 })
    expect(constrained).toEqual({ ax: 0, ay: 0, bx: 100, by: 100 })

    const walls = buildRoomWalls(constrained, 1)
    expect(walls).toHaveLength(4)
    expect(walls[0].points).toEqual([0, 0, 100, 0])
    expect(walls[1].points).toEqual([100, 0, 100, 100])
    expect(walls[2].points).toEqual([100, 100, 0, 100])
    expect(walls[3].points).toEqual([0, 100, 0, 0])
  })

  it('zero-area drag commits no walls (defensive guard against accidental clicks)', () => {
    expect(buildRoomWalls({ ax: 50, ay: 50, bx: 50, by: 50 }, 1)).toEqual([])
    expect(buildRoomWalls({ ax: 0, ay: 0, bx: 100, by: 0 }, 1)).toEqual([])
  })
})

describe('Fix 3 — auto-close on snap-back to start', () => {
  it('clicking near the first vertex of a 3-vertex polyline auto-closes AND finalises the wall', () => {
    const { result } = renderHook(() => useWallDrawing())
    // Click corner 1 at (0, 0).
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
    })
    // Click corner 2 at (100, 0).
    act(() => {
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseUp(100, 0)
    })
    // Click corner 3 at (100, 100).
    act(() => {
      result.current.handleCanvasMouseDown(100, 100)
      result.current.handleCanvasMouseUp(100, 100)
    })
    // Now click near (5, 5) — within ENDPOINT_SNAP_PX (10) of the
    // starting vertex (0, 0). This should auto-close the polyline AND
    // finalise the wall (no double-click).
    act(() => {
      result.current.handleCanvasMouseDown(5, 5)
      result.current.handleCanvasMouseUp(5, 5)
    })

    // Drawing session is reset (the wall has been committed).
    expect(result.current.wallDrawingState.isDrawing).toBe(false)

    // Exactly one wall is now in the elements store; its points loop
    // back to (0, 0) at the closing vertex.
    const elements = useElementsStore.getState().elements
    const walls = Object.values(elements).filter(
      (e) => e.type === 'wall',
    ) as WallElement[]
    expect(walls).toHaveLength(1)
    const w = walls[0]
    // 4 vertices total: start, two corners, and the closing-back-to-
    // start vertex.
    expect(w.points.length).toBe(8)
    // First vertex is (0, 0) and the LAST vertex is also (0, 0) — the
    // polyline geometrically closes.
    expect(w.points.slice(0, 2)).toEqual([0, 0])
    expect(w.points.slice(-2)).toEqual([0, 0])
  })

  it('does NOT auto-close after only 2 vertices (would produce a degenerate shape)', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
    })
    act(() => {
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseUp(100, 0)
    })
    // Click near start with only 2 vertices — should NOT auto-close,
    // because doing so would commit a 1-segment wall folding back onto
    // itself.
    act(() => {
      result.current.handleCanvasMouseDown(3, 3)
      result.current.handleCanvasMouseUp(3, 3)
    })
    // Still drawing — the wall has not been finalised.
    expect(result.current.wallDrawingState.isDrawing).toBe(true)
    // No wall in the store yet either.
    expect(
      Object.values(useElementsStore.getState().elements).filter(
        (e) => e.type === 'wall',
      ),
    ).toHaveLength(0)
  })
})

describe('Fix 4 — connectedWallIds dead-field retired', () => {
  it("a `WallElement` typed value does NOT allow `connectedWallIds`", () => {
    // Build a minimal but valid `WallElement`. The TS expect-error
    // assertion below proves at type-check time that the legacy
    // `connectedWallIds` slot is no longer part of the interface.
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
      style: { fill: '#000', stroke: '#000', strokeWidth: 6, opacity: 1 },
      points: [0, 0, 100, 0],
      bulges: [0],
      thickness: 6,
      wallType: 'solid',
      // @ts-expect-error connectedWallIds was removed from WallElement
      connectedWallIds: [],
    }
    // Runtime: even if `connectedWallIds` is ignored at the type level,
    // the value still has the field at runtime — so we just verify the
    // wall was constructed and the typed view doesn't blow up.
    expect(w.type).toBe('wall')
  })
})
