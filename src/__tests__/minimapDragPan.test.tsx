/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Minimap } from '../components/editor/Minimap'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useCanvasStore } from '../stores/canvasStore'
import type { DeskElement } from '../types/elements'

function desk(id: string, x = 0, y = 0): DeskElement {
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

beforeEach(() => {
  useElementsStore.setState({ elements: { a: desk('a', 0, 0), b: desk('b', 400, 300) } } as any)
  useUIStore.setState({ selectedIds: [] } as any)
  useCanvasStore.setState({
    stageX: 0,
    stageY: 0,
    stageScale: 1,
    setStagePosition: vi.fn(),
  } as any)
})

/**
 * The minimap has two interaction channels: click-to-jump (unchanged
 * from the previous iteration) and drag-to-scrub (new). The drag path
 * attaches listeners to `window` rather than the minimap div so the
 * pointer can leave the minimap without breaking the drag — these
 * tests cover that path end-to-end by dispatching real PointerEvents
 * on window.
 */
describe('Minimap drag-to-pan', () => {
  it('pointerdown centres the canvas on the clicked point', () => {
    const setStagePosition = vi.fn()
    useCanvasStore.setState({ setStagePosition } as any)

    const { container } = render(<Minimap />)
    const minimap = container.querySelector('[aria-label="Minimap"]') as HTMLElement

    // Fake the bounding rect so local coordinates are predictable. JSDOM
    // gives every element a 0×0 rect by default, which would make every
    // pointer location inside the minimap map to the same spot.
    vi.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 180, bottom: 120, x: 0, y: 0, width: 180, height: 120, toJSON: () => ({}),
    } as DOMRect)

    minimap.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 90, clientY: 60, bubbles: true, button: 0 }),
    )

    expect(setStagePosition).toHaveBeenCalledTimes(1)
  })

  it('pointermove after pointerdown continues to pan (drag scrub)', () => {
    const setStagePosition = vi.fn()
    useCanvasStore.setState({ setStagePosition } as any)

    const { container } = render(<Minimap />)
    const minimap = container.querySelector('[aria-label="Minimap"]') as HTMLElement
    vi.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 180, bottom: 120, x: 0, y: 0, width: 180, height: 120, toJSON: () => ({}),
    } as DOMRect)

    minimap.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true, button: 0 }),
    )
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 80 }))

    // 1 for pointerdown + 2 for subsequent moves.
    expect(setStagePosition).toHaveBeenCalledTimes(3)
  })

  it('pointerup ends the drag — further pointermoves are ignored', () => {
    const setStagePosition = vi.fn()
    useCanvasStore.setState({ setStagePosition } as any)

    const { container } = render(<Minimap />)
    const minimap = container.querySelector('[aria-label="Minimap"]') as HTMLElement
    vi.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 180, bottom: 120, x: 0, y: 0, width: 180, height: 120, toJSON: () => ({}),
    } as DOMRect)

    minimap.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true, button: 0 }),
    )
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }))
    window.dispatchEvent(new PointerEvent('pointerup', {}))

    setStagePosition.mockClear()

    // After pointerup, additional moves should NOT pan anymore.
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 90 }))
    expect(setStagePosition).not.toHaveBeenCalled()
  })

  it('non-primary mouse buttons do not trigger a pan', () => {
    const setStagePosition = vi.fn()
    useCanvasStore.setState({ setStagePosition } as any)

    const { container } = render(<Minimap />)
    const minimap = container.querySelector('[aria-label="Minimap"]') as HTMLElement
    vi.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 180, bottom: 120, x: 0, y: 0, width: 180, height: 120, toJSON: () => ({}),
    } as DOMRect)

    // Right-click (button === 2) on a mouse should be a no-op — the
    // browser's context menu handling should win instead.
    minimap.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 90,
        clientY: 60,
        bubbles: true,
        button: 2,
        pointerType: 'mouse',
      }),
    )

    expect(setStagePosition).not.toHaveBeenCalled()
  })
})
