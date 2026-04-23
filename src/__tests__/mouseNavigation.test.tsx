/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
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
