/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Minimap } from '../components/editor/Minimap'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useCanvasStore } from '../stores/canvasStore'
import type { DeskElement } from '../types/elements'

/**
 * Wave 10A integration: the minimap is now an interactive control —
 * click/drag pans the stage, and a chevron button collapses the panel
 * down to a 40x40 handle. These tests assert the new behaviours sit on
 * top of the existing drag-pan plumbing without breaking it.
 */

function flushRAF() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

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
  useElementsStore.setState({
    elements: { a: desk('a', 0, 0), b: desk('b', 400, 300) },
  } as any)
  useUIStore.setState({ selectedIds: [], minimapVisible: true } as any)
  useCanvasStore.setState({
    stageX: 0,
    stageY: 0,
    stageScale: 1,
    stageWidth: 1000,
    stageHeight: 800,
    setStagePosition: vi.fn(),
  } as any)
})

function getRegion(container: HTMLElement) {
  return container.querySelector('[aria-label="Canvas overview"]') as HTMLElement
}

function mockRect(el: HTMLElement) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 180,
    bottom: 120,
    x: 0,
    y: 0,
    width: 180,
    height: 120,
    toJSON: () => ({}),
  } as DOMRect)
}

describe('Minimap interactive (Wave 10A)', () => {
  it('renders with role="region" and an aria-label for screen readers', () => {
    const { container } = render(<Minimap />)
    const region = getRegion(container)
    expect(region).toBeTruthy()
    expect(region.getAttribute('role')).toBe('region')
    expect(region.getAttribute('aria-label')).toBe('Canvas overview')
  })

  it('click in empty minimap area updates stage position', async () => {
    const setStagePosition = vi.fn()
    useCanvasStore.setState({ setStagePosition } as any)

    const { container } = render(<Minimap />)
    const region = getRegion(container)
    mockRect(region)

    region.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 90,
        clientY: 60,
        bubbles: true,
        button: 0,
      }),
    )
    await flushRAF()

    expect(setStagePosition).toHaveBeenCalledTimes(1)
    // First arg should be a finite number — confirms the world->screen
    // math ran without producing NaN/Infinity.
    const [x, y] = setStagePosition.mock.calls[0]
    expect(Number.isFinite(x)).toBe(true)
    expect(Number.isFinite(y)).toBe(true)
  })

  it('pointerdown + two pointermoves trigger three pan updates', async () => {
    const setStagePosition = vi.fn()
    useCanvasStore.setState({ setStagePosition } as any)

    const { container } = render(<Minimap />)
    const region = getRegion(container)
    mockRect(region)

    region.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true, button: 0 }),
    )
    await flushRAF()
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 40 }))
    await flushRAF()
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 90, clientY: 70 }))
    await flushRAF()

    expect(setStagePosition).toHaveBeenCalledTimes(3)
    window.dispatchEvent(new PointerEvent('pointerup', {}))
  })

  it('collapse button toggles aria-expanded and shrinks the panel', () => {
    const { container } = render(<Minimap />)

    const collapseBtn = container.querySelector(
      '[data-minimap-collapse-button]',
    ) as HTMLButtonElement
    expect(collapseBtn).toBeTruthy()
    expect(collapseBtn.getAttribute('aria-expanded')).toBe('true')
    expect(collapseBtn.getAttribute('aria-label')).toBe('Collapse overview')

    fireEvent.click(collapseBtn)

    // After collapse: the minimap's tile-grid SVG (width=180) should be
    // gone — the only SVGs left are the lucide icon glyph(s). The
    // remaining button should also flip aria-expanded=false.
    expect(container.querySelector('svg[width="180"]')).toBeNull()
    const expandBtn = container.querySelector(
      '[data-minimap-collapse-button]',
    ) as HTMLButtonElement
    expect(expandBtn.getAttribute('aria-expanded')).toBe('false')
    expect(expandBtn.getAttribute('aria-label')).toBe('Expand overview')

    // Clicking again should restore the full minimap with the tile SVG.
    fireEvent.click(expandBtn)
    expect(container.querySelector('svg[width="180"]')).toBeTruthy()
  })

  it('pointerdown on the collapse button does not pan the stage', async () => {
    const setStagePosition = vi.fn()
    useCanvasStore.setState({ setStagePosition } as any)

    const { container } = render(<Minimap />)
    const region = getRegion(container)
    mockRect(region)

    const collapseBtn = container.querySelector(
      '[data-minimap-collapse-button]',
    ) as HTMLButtonElement

    // The pan handler is attached to the parent region, but the button is
    // a descendant — so a pointerdown on the button bubbles up. The
    // handler should bail on `closest('[data-minimap-collapse-button]')`.
    collapseBtn.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 170,
        clientY: 5,
        bubbles: true,
        button: 0,
      }),
    )
    await flushRAF()

    expect(setStagePosition).not.toHaveBeenCalled()
  })

  it('pointerdown inside the viewport indicator rect does not crash', async () => {
    // The viewport indicator is just an SVG <rect> — pointer events fall
    // through to the parent div, which initiates a normal pan. We just
    // assert nothing throws and a pan is produced.
    const setStagePosition = vi.fn()
    useCanvasStore.setState({ setStagePosition } as any)

    const { container } = render(<Minimap />)
    const region = getRegion(container)
    mockRect(region)

    expect(() => {
      region.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: 5,
          clientY: 5,
          bubbles: true,
          button: 0,
        }),
      )
    }).not.toThrow()

    await flushRAF()
    expect(setStagePosition).toHaveBeenCalled()
    window.dispatchEvent(new PointerEvent('pointerup', {}))
  })
})
