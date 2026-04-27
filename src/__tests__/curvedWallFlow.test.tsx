import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWallDrawing } from '../hooks/useWallDrawing'
import { useElementsStore } from '../stores/elementsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'
import { applyBulgeFromDrag } from '../lib/wallEditing'
import type { WallElement } from '../types/elements'

function walls(): WallElement[] {
  return Object.values(useElementsStore.getState().elements).filter(
    (e): e is WallElement => e.type === 'wall',
  )
}

describe('Curved wall end-to-end flow', () => {
  beforeEach(() => {
    useElementsStore.setState({ elements: {} })
    useUIStore.setState({ selectedIds: [] })
    useCanvasStore.setState((s) => ({
      activeTool: 'wall',
      settings: { ...s.settings, showGrid: false },
    }))
  })

  it('draw click, click-drag, click, dblclick → mixed segments', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      // vertex 1 (click)
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      // vertex 2 (click-drag): mouse goes down at (100,0), drags to (60,-30),
      // releases back at (100,0). The drag endpoint is preserved so mouseUp
      // still commits a bulged segment.
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseMove(60, -30)
      result.current.handleCanvasMouseUp(100, 0)
      // vertex 3 (click)
      result.current.handleCanvasMouseDown(200, 0)
      result.current.handleCanvasMouseUp(200, 0)
      // vertex 4 (click)
      result.current.handleCanvasMouseDown(300, 0)
      result.current.handleCanvasMouseUp(300, 0)
      result.current.handleCanvasDoubleClick()
    })
    const w = walls()[0]
    expect(w.points).toHaveLength(8)
    expect(w.bulges).toHaveLength(3)
    expect(w.bulges![0]).not.toBe(0)
    expect(w.bulges![1]).toBe(0)
    expect(w.bulges![2]).toBe(0)
  })

  it('dragging midpoint back to chord flattens the segment', () => {
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
      bulges: [20, 0],
      thickness: 6,
      wallType: 'solid',
    }
    useElementsStore.setState({ elements: { w1: w } })
    act(() => {
      applyBulgeFromDrag('w1', 0, { x: 50, y: 0 }) // snap to chord
    })
    const after = useElementsStore.getState().elements.w1 as WallElement
    expect(after.bulges).toEqual([0, 0])
  })

  it('undo restores previous bulges', () => {
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
      points: [0, 0, 100, 0],
      bulges: [0],
      thickness: 6,
      wallType: 'solid',
    }
    useElementsStore.setState({ elements: { w1: w } })
    const temporal = useElementsStore.temporal.getState()
    // zundo auto-snapshots on setState; trigger an update and undo.
    act(() => {
      applyBulgeFromDrag('w1', 0, { x: 50, y: -30 })
    })
    const mid = useElementsStore.getState().elements.w1 as WallElement
    expect(mid.bulges![0]).not.toBe(0)

    act(() => {
      temporal.undo()
    })
    const back = useElementsStore.getState().elements.w1 as WallElement
    expect(back.bulges![0]).toBe(0)
  })
})
