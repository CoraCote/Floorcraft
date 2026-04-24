/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { renderHook, render, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'
import { useElementsStore } from '../stores/elementsStore'

/**
 * The editor's "navigate with the mouse / keyboard" cluster:
 *   - Space-hold flips to pan temporarily
 *   - Arrow keys pan the canvas when no selection is active
 *   - (Wheel pan discrimination lives on CanvasStage and is covered
 *      separately at the unit level — this file covers the hook paths.)
 *
 * Each test rewrites the stores to a clean baseline so ordering doesn't
 * matter; the keyboard listener is attached in an effect, so we mount
 * the hook inside a router (it reads useParams) before dispatching.
 */

function mountHook() {
  return renderHook(() => useKeyboardShortcuts(), {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  })
}

beforeEach(() => {
  useCanvasStore.setState({
    stageX: 0,
    stageY: 0,
    stageScale: 1,
    activeTool: 'select',
  } as any)
  useUIStore.setState({ selectedIds: [], modalOpenCount: 0, presentationMode: false } as any)
  useElementsStore.setState({ elements: {} } as any)
})

describe('Space-hold → temporary pan', () => {
  it('keydown flips activeTool to pan, keyup restores the previous tool', () => {
    useCanvasStore.setState({ activeTool: 'select' } as any)
    mountHook()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(useCanvasStore.getState().activeTool).toBe('pan')

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }))
    expect(useCanvasStore.getState().activeTool).toBe('select')
  })

  it('preserves the non-select tool on release (Space during wall draw → back to wall)', () => {
    useCanvasStore.setState({ activeTool: 'wall' } as any)
    mountHook()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(useCanvasStore.getState().activeTool).toBe('pan')
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
    expect(useCanvasStore.getState().activeTool).toBe('wall')
  })

  it('auto-repeat keydown does not overwrite the stored previous tool', () => {
    useCanvasStore.setState({ activeTool: 'wall' } as any)
    mountHook()

    // First real press saves 'wall' and switches to 'pan'.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    // Auto-repeat events would, without the guard, re-save 'pan' as the
    // "previous tool", so keyup would appear to do nothing.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', repeat: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', repeat: true }))

    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
    expect(useCanvasStore.getState().activeTool).toBe('wall')
  })

  it('ignores Space while typing in an input', () => {
    useCanvasStore.setState({ activeTool: 'select' } as any)
    mountHook()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    expect(useCanvasStore.getState().activeTool).toBe('select')

    document.body.removeChild(input)
  })

  it('window blur restores tool if user alt-tabs while holding Space', () => {
    useCanvasStore.setState({ activeTool: 'select' } as any)
    mountHook()

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
    expect(useCanvasStore.getState().activeTool).toBe('pan')

    // Alt-tab away → no keyup ever arrives, but blur does. Without the
    // blur handler the user would be stuck in pan mode forever.
    window.dispatchEvent(new Event('blur'))
    expect(useCanvasStore.getState().activeTool).toBe('select')
  })
})

describe('Arrow keys → pan canvas when no selection', () => {
  it('ArrowRight with empty selection moves stageX negative (viewport scrolls right)', () => {
    mountHook()
    const before = useCanvasStore.getState().stageX

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    const after = useCanvasStore.getState().stageX

    // ArrowRight reveals more content on the right → stage content
    // translates left on screen → stageX decreases.
    expect(after).toBeLessThan(before)
  })

  it('ArrowUp moves stageY positive (viewport scrolls up)', () => {
    mountHook()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(useCanvasStore.getState().stageY).toBeGreaterThan(0)
  })

  it('Shift+Arrow pans by a larger step', () => {
    mountHook()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    const smallStep = Math.abs(useCanvasStore.getState().stageY)

    useCanvasStore.setState({ stageY: 0 } as any)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }))
    const bigStep = Math.abs(useCanvasStore.getState().stageY)

    expect(bigStep).toBeGreaterThan(smallStep)
  })

  it('with a selection, arrows still nudge elements (pan branch does not fire)', () => {
    // Create a fake element so the existing nudge path has something to do.
    act(() => {
      useElementsStore.setState({
        elements: {
          d1: {
            id: 'd1',
            type: 'desk',
            x: 100,
            y: 100,
            width: 40,
            height: 20,
            rotation: 0,
            locked: false,
            groupId: null,
            zIndex: 0,
            label: 'd1',
            visible: true,
            assignedEmployeeId: null,
            style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
          },
        },
      } as any)
      useUIStore.setState({ selectedIds: ['d1'] } as any)
    })
    mountHook()

    const stageBefore = useCanvasStore.getState().stageX
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    // Stage should NOT have moved — the element should have.
    expect(useCanvasStore.getState().stageX).toBe(stageBefore)
    expect((useElementsStore.getState().elements as any).d1.x).toBeGreaterThan(100)
  })
})

/**
 * Wave 8D: Miro-style click-and-drag pan from the select tool.
 *
 * The new behaviour:
 *   - Primary-button drag on empty stage with `select` and no modifier → pan.
 *   - Shift + primary-button drag on empty stage → marquee select.
 *   - Click without drag (≤4px movement) on empty stage → deselect.
 *   - Middle-button and explicit `pan` tool still pan unconditionally.
 *
 * Driving CanvasStage in jsdom requires a Konva canvas-context shim plus
 * mocking out the heavy child layers/overlays (Konva is fine in jsdom but
 * the renderers expect a real stage they can hit-test against). The Konva
 * stage's `_pointerdown` is bound to its content `<div>`, so dispatching
 * native MouseEvents on that div drives the same code path as a real click.
 */

// Stub canvas context so Konva can mount. Same pattern as
// wallAttachmentGhost.test.tsx — reused here to keep test infra co-located.
beforeAll(() => {
  // CanvasStage observes its container with ResizeObserver to publish
  // size to the canvas store. jsdom doesn't ship one — install a no-op.
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    ;(globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  const mockCtx = {
    scale: () => {}, clearRect: () => {}, fillRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {},
    lineTo: () => {}, arc: () => {}, fill: () => {}, stroke: () => {},
    save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    transform: () => {}, setTransform: () => {}, drawImage: () => {},
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {}, clip: () => {}, rect: () => {},
    isPointInPath: () => false,
    canvas: { width: 0, height: 0 },
  } as unknown as CanvasRenderingContext2D
  HTMLCanvasElement.prototype.getContext = (() =>
    mockCtx) as unknown as HTMLCanvasElement['getContext']
})

// Mock every CanvasStage child component to a no-op layer. The nav tests
// only care about pan/marquee/deselect on the bare Stage — none of the
// renderer logic. Each mock returns null so react-konva is happy.
vi.mock('../components/editor/Canvas/GridLayer', () => ({ GridLayer: () => null }))
vi.mock('../components/editor/Canvas/ElementRenderer', () => ({ ElementRenderer: () => null }))
vi.mock('../components/editor/Canvas/SelectionOverlay', () => ({ SelectionOverlay: () => null }))
vi.mock('../components/editor/Canvas/HoverOutline', () => ({ HoverOutline: () => null }))
vi.mock('../components/editor/Canvas/AlignmentGuides', () => ({ AlignmentGuides: () => null }))
vi.mock('../components/editor/Canvas/WallDrawingOverlay', () => ({ WallDrawingOverlay: () => null }))
vi.mock('../components/editor/Canvas/WallEditOverlay', () => ({ WallEditOverlay: () => null }))
vi.mock('../components/editor/Canvas/AttachmentGhost', () => ({ AttachmentGhost: () => null }))
vi.mock('../components/editor/Canvas/MarqueeOverlay', () => ({ MarqueeOverlay: () => null }))
vi.mock('../components/editor/Canvas/DimensionLayer', () => ({ DimensionLayer: () => null }))
vi.mock('../components/editor/Canvas/NeighborhoodLayer', () => ({ NeighborhoodLayer: () => null }))
vi.mock('../components/editor/Canvas/NeighborhoodEditOverlay', () => ({ NeighborhoodEditOverlay: () => null }))
vi.mock('../components/editor/Canvas/NeighborhoodOverlay', () => ({ NeighborhoodOverlay: () => null }))
vi.mock('../components/editor/Canvas/EquipmentOverlayLayer', () => ({ EquipmentOverlayLayer: () => null }))
vi.mock('../components/editor/Canvas/AnnotationLayer', () => ({ AnnotationLayer: () => null }))
vi.mock('../components/editor/Canvas/AnnotationPopover', () => ({
  AnnotationPopover: () => null,
  setLastPinAnchor: () => {},
}))
vi.mock('../components/editor/Canvas/EmptyCanvasHint', () => ({ EmptyCanvasHint: () => null }))
vi.mock('../components/editor/Canvas/primitives/ShapeDrawingOverlay', () => ({ ShapeDrawingOverlay: () => null }))
vi.mock('../components/editor/Canvas/primitives/FreeTextEditorOverlay', () => ({ FreeTextEditorOverlay: () => null }))
vi.mock('../components/editor/Canvas/MeasureOverlay', () => ({ MeasureOverlay: () => null }))
vi.mock('../components/editor/Canvas/CalibrateOverlay', () => ({ CalibrateOverlay: () => null }))
vi.mock('../components/reports/OrgChartOverlay', () => ({ OrgChartOverlay: () => null }))
vi.mock('../components/reports/SeatMapColorMode', () => ({ SeatMapColorMode: () => null }))

describe('Wave 8D: click-drag pan on empty canvas', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      stageX: 0, stageY: 0, stageScale: 1, activeTool: 'select',
    } as any)
    useUIStore.setState({ selectedIds: ['existing-1'], modalOpenCount: 0, presentationMode: false } as any)
    useElementsStore.setState({ elements: {} } as any)
  })

  /** Find the Konva content div (Konva's mousedown listener target). */
  function getKonvaContent(container: HTMLElement): HTMLDivElement {
    const content = container.querySelector('.konvajs-content') as HTMLDivElement | null
    if (!content) throw new Error('Konva content div not found')
    return content
  }

  /** Mount CanvasStage inside a router so any descendant hooks resolve. */
  async function mountStage() {
    const { CanvasStage } = await import('../components/editor/Canvas/CanvasStage')
    return render(
      <MemoryRouter>
        <div style={{ width: 800, height: 600 }}>
          <CanvasStage />
        </div>
      </MemoryRouter>,
    )
  }

  function fire(target: HTMLElement, type: string, opts: MouseEventInit) {
    const evt = new MouseEvent(type, { bubbles: true, cancelable: true, ...opts })
    target.dispatchEvent(evt)
  }

  it('primary-button drag on empty stage with select tool pans the stage', async () => {
    const { container } = await mountStage()
    const content = getKonvaContent(container)
    const beforeX = useCanvasStore.getState().stageX
    const beforeY = useCanvasStore.getState().stageY

    await act(async () => {
      fire(content, 'mousedown', { button: 0, clientX: 100, clientY: 100, shiftKey: false })
      fire(content, 'mousemove', { button: 0, clientX: 160, clientY: 140 })
      fire(content, 'mouseup', { button: 0, clientX: 160, clientY: 140 })
    })

    const after = useCanvasStore.getState()
    expect(after.stageX - beforeX).toBe(60)
    expect(after.stageY - beforeY).toBe(40)
  })

  it('Shift+primary-button drag does NOT pan (marquee branch)', async () => {
    const { container } = await mountStage()
    const content = getKonvaContent(container)
    const beforeX = useCanvasStore.getState().stageX
    const beforeY = useCanvasStore.getState().stageY

    await act(async () => {
      fire(content, 'mousedown', { button: 0, clientX: 100, clientY: 100, shiftKey: true })
      fire(content, 'mousemove', { button: 0, clientX: 200, clientY: 200, shiftKey: true })
      fire(content, 'mouseup', { button: 0, clientX: 200, clientY: 200, shiftKey: true })
    })

    // Shift+drag is marquee, not pan — stage position is unchanged.
    expect(useCanvasStore.getState().stageX).toBe(beforeX)
    expect(useCanvasStore.getState().stageY).toBe(beforeY)
  })

  it('click without drag on empty stage still deselects', async () => {
    const { container } = await mountStage()
    const content = getKonvaContent(container)

    expect(useUIStore.getState().selectedIds).toEqual(['existing-1'])

    await act(async () => {
      // Press at (100,100) and release at the exact same point (no drag).
      fire(content, 'mousedown', { button: 0, clientX: 100, clientY: 100 })
      fire(content, 'mouseup', { button: 0, clientX: 100, clientY: 100 })
    })

    // Selection should be cleared — same observable as the pre-Wave-8D
    // marquee-zero-area path.
    expect(useUIStore.getState().selectedIds).toEqual([])
    // And stage should NOT have moved.
    expect(useCanvasStore.getState().stageX).toBe(0)
  })

  it('press-then-tiny-jitter still treats as click and deselects', async () => {
    // 3px movement is below the 4px threshold — should be treated as a
    // click (deselect) rather than a pan.
    const { container } = await mountStage()
    const content = getKonvaContent(container)

    await act(async () => {
      fire(content, 'mousedown', { button: 0, clientX: 100, clientY: 100 })
      fire(content, 'mousemove', { button: 0, clientX: 102, clientY: 101 })
      fire(content, 'mouseup', { button: 0, clientX: 102, clientY: 101 })
    })

    expect(useUIStore.getState().selectedIds).toEqual([])
    // Stage may have moved by 2/1 px — that's the existing pan-handler
    // behaviour and is fine; the deselect-on-no-real-drag is the contract.
  })

  it('middle-button drag still pans (regression guard)', async () => {
    const { container } = await mountStage()
    const content = getKonvaContent(container)
    const beforeX = useCanvasStore.getState().stageX

    await act(async () => {
      fire(content, 'mousedown', { button: 1, clientX: 50, clientY: 50 })
      fire(content, 'mousemove', { button: 1, clientX: 130, clientY: 50 })
      fire(content, 'mouseup', { button: 1, clientX: 130, clientY: 50 })
    })

    expect(useCanvasStore.getState().stageX - beforeX).toBe(80)
  })

  it('explicit pan tool still pans on primary button (regression guard)', async () => {
    useCanvasStore.setState({ activeTool: 'pan' } as any)
    const { container } = await mountStage()
    const content = getKonvaContent(container)
    const beforeY = useCanvasStore.getState().stageY

    await act(async () => {
      fire(content, 'mousedown', { button: 0, clientX: 50, clientY: 50 })
      fire(content, 'mousemove', { button: 0, clientX: 50, clientY: 130 })
      fire(content, 'mouseup', { button: 0, clientX: 50, clientY: 130 })
    })

    expect(useCanvasStore.getState().stageY - beforeY).toBe(80)
  })
})
