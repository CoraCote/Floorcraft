/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Konva from 'konva'
import { focusElements } from '../lib/focusElements'
import { setActiveStage } from '../lib/stageRegistry'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useUIStore } from '../stores/uiStore'
import { useCanvasStore } from '../stores/canvasStore'
import type { DeskElement } from '../types/elements'

function desk(id: string, x: number, y: number): DeskElement {
  return {
    id,
    type: 'desk',
    x,
    y,
    width: 40,
    height: 20,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: id,
    visible: true,
    assignedEmployeeId: null,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  } as DeskElement
}

function makeFakeStage(width = 800, height = 600) {
  // focusElements only calls stage.width() / stage.height(), so a stub
  // with those two methods is enough. Keep it minimal.
  return { width: () => width, height: () => height } as unknown as Konva.Stage
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} } as any)
  useUIStore.setState({ selectedIds: [] } as any)
  useFloorStore.setState({
    floors: [
      { id: 'f1', name: 'Floor 1', order: 0, elements: {} },
      { id: 'f2', name: 'Floor 2', order: 1, elements: {} },
    ],
    activeFloorId: 'f1',
  } as any)
  useCanvasStore.setState({ stageX: 0, stageY: 0, stageScale: 1 } as any)
  setActiveStage(null)
})

describe('focusElements', () => {
  it('returns false for an empty id list and does nothing', () => {
    const selected = useUIStore.getState().selectedIds
    expect(focusElements([])).toBe(false)
    expect(useUIStore.getState().selectedIds).toBe(selected)
  })

  it('returns false when no ids resolve to a known element (stale insight)', () => {
    useElementsStore.setState({ elements: {} } as any)
    expect(focusElements(['missing'])).toBe(false)
  })

  it('selects the elements and calls zoomToFit when the stage is mounted', () => {
    const zoomToFitSpy = vi.spyOn(useCanvasStore.getState(), 'zoomToFit')
    useElementsStore.setState({ elements: { a: desk('a', 100, 100), b: desk('b', 200, 150) } } as any)
    setActiveStage(makeFakeStage(800, 600))

    expect(focusElements(['a', 'b'])).toBe(true)
    expect(useUIStore.getState().selectedIds).toEqual(['a', 'b'])
    expect(zoomToFitSpy).toHaveBeenCalledOnce()
    const [bounds, w, h] = zoomToFitSpy.mock.calls[0]
    expect(w).toBe(800)
    expect(h).toBe(600)
    // Bounds should cover both desks with padding.
    expect(bounds.width).toBeGreaterThan(40)
    expect(bounds.height).toBeGreaterThan(20)
  })

  it('still selects even if the stage is not mounted (no pan, but UX progresses)', () => {
    useElementsStore.setState({ elements: { a: desk('a', 0, 0) } } as any)
    // No setActiveStage — registry returns null.

    expect(focusElements(['a'])).toBe(true)
    expect(useUIStore.getState().selectedIds).toEqual(['a'])
  })

  it('switches floors when the ids live on a non-active floor', () => {
    // Active floor has nothing; floor 2 owns the target element.
    useElementsStore.setState({ elements: {} } as any)
    useFloorStore.setState({
      floors: [
        { id: 'f1', name: 'Floor 1', order: 0, elements: {} },
        { id: 'f2', name: 'Floor 2', order: 1, elements: { b: desk('b', 50, 50) } },
      ],
      activeFloorId: 'f1',
    } as any)
    setActiveStage(makeFakeStage())

    expect(focusElements(['b'])).toBe(true)
    expect(useFloorStore.getState().activeFloorId).toBe('f2')
    expect(useUIStore.getState().selectedIds).toEqual(['b'])
    // `switchToFloor` loaded floor 2's elements into the elementsStore.
    expect(useElementsStore.getState().elements.b).toBeDefined()
  })
})
