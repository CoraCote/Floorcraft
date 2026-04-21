import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWallDrawing } from '../hooks/useWallDrawing'
import { useCanvasStore } from '../stores/canvasStore'
import { useElementsStore } from '../stores/elementsStore'
import type { WallElement } from '../types/elements'

function walls(): WallElement[] {
  return Object.values(useElementsStore.getState().elements).filter(
    (e): e is WallElement => e.type === 'wall',
  )
}

describe('useWallDrawing click-drag', () => {
  beforeEach(() => {
    useElementsStore.setState({ elements: {} })
    useCanvasStore.setState((s) => ({
      activeTool: 'wall',
      settings: { ...s.settings, showGrid: false },
    }))
  })

  it('mousedown+mouseup within drag threshold commits a straight vertex', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseUp(100, 0)
      result.current.handleCanvasDoubleClick()
    })
    const w = walls()[0]
    expect(w.bulges).toEqual([0])
  })

  it('drag > threshold commits a non-zero bulge', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseMove(50, -20)
      result.current.handleCanvasMouseUp(100, 0)
      result.current.handleCanvasDoubleClick()
    })
    const w = walls()[0]
    expect(w.bulges!.length).toBe(1)
    expect(Math.abs(w.bulges![0])).toBeGreaterThan(0)
  })

  it('deadzone: drag of ≤2 px commits as straight', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseMove(50, -1.5)
      result.current.handleCanvasMouseUp(100, 0)
      result.current.handleCanvasDoubleClick()
    })
    expect(walls()[0].bulges).toEqual([0])
  })

  it('clamps magnitude to chordLength / 2', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseMove(50, -999)
      result.current.handleCanvasMouseUp(100, 0)
      result.current.handleCanvasDoubleClick()
    })
    expect(Math.abs(walls()[0].bulges![0])).toBeCloseTo(50, 1)
  })

  it('bulges.length === points.length/2 - 1', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseUp(100, 0)
      result.current.handleCanvasMouseDown(200, 0)
      result.current.handleCanvasMouseUp(200, 0)
      result.current.handleCanvasDoubleClick()
    })
    const w = walls()[0]
    expect(w.bulges!.length).toBe(w.points.length / 2 - 1)
  })

  it('cancel clears points and bulges', () => {
    const { result } = renderHook(() => useWallDrawing())
    act(() => {
      result.current.handleCanvasMouseDown(0, 0)
      result.current.handleCanvasMouseUp(0, 0)
      result.current.handleCanvasMouseDown(100, 0)
      result.current.handleCanvasMouseUp(100, 0)
      result.current.cancelDrawing()
    })
    expect(result.current.wallDrawingState.points).toEqual([])
    expect(result.current.wallDrawingState.bulges).toEqual([])
  })
})
