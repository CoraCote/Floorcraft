/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { StatusBar } from '../components/editor/StatusBar'
import { useCursorStore } from '../stores/cursorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useCanvasStore } from '../stores/canvasStore'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import type { CanvasElement } from '../types/elements'

/**
 * Helper: minimal `desk` factory shaped like the rest of the test suite
 * (see utilizationMetrics.test.ts) — the StatusBar only reads `type`,
 * `assignedEmployeeId`, etc., so we cast to the union type and skip
 * style/seatStatus.
 */
function desk(id: string, assigned: string | null): CanvasElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    deskId: id,
    assignedEmployeeId: assigned,
    capacity: 1,
  } as unknown as CanvasElement
}

beforeEach(() => {
  useCursorStore.setState({ x: null, y: null })
  useElementsStore.setState({ elements: {} } as any)
  useUIStore.setState({ selectedIds: [] } as any)
  useCanvasStore.setState({
    stageScale: 1,
    activeTool: 'select',
    settings: { ...DEFAULT_CANVAS_SETTINGS, scaleUnit: 'px' },
  } as any)
})

/**
 * Locate a StatItem by its uppercase label and return its sibling value
 * span so tests can assert text + class. The component renders each
 * StatItem as `<span><span>{LABEL}</span><span>{value}</span></span>`.
 */
function valueFor(label: string): HTMLElement {
  const labelEl = screen.getByText(label, { selector: 'span' })
  const wrapper = labelEl.parentElement as HTMLElement
  expect(wrapper).toBeTruthy()
  // The value is the second child span of the wrapper.
  const value = wrapper.children[1] as HTMLElement
  expect(value).toBeTruthy()
  return value
}

describe('StatusBar — JSON Crack-inspired polish', () => {
  it('renders Desks / Assigned / Open / Occupancy from a seeded elements store', () => {
    // 4 desks, 3 assigned → Open=1, Occupancy=75%
    useElementsStore.setState({
      elements: {
        d1: desk('d1', 'e1'),
        d2: desk('d2', 'e2'),
        d3: desk('d3', 'e3'),
        d4: desk('d4', null),
      },
    } as any)

    render(<StatusBar />)

    expect(valueFor('Desks')).toHaveTextContent('4')
    expect(valueFor('Assigned')).toHaveTextContent('3')
    expect(valueFor('Open')).toHaveTextContent('1')
    expect(valueFor('Occupancy')).toHaveTextContent('75%')
  })

  it('hides the Selected stat when nothing is selected', () => {
    render(<StatusBar />)
    expect(screen.queryByText('Selected')).toBeNull()
  })

  it('shows the Selected stat in blue when items are selected', () => {
    useUIStore.setState({ selectedIds: ['a', 'b'] } as any)
    render(<StatusBar />)
    const value = valueFor('Selected')
    expect(value).toHaveTextContent('2')
    // Accent="blue" → the value span gets text-blue-600 (light) class.
    expect(value.className).toContain('text-blue-600')
  })

  it('hides the cursor block when no cursor position is set', () => {
    render(<StatusBar />)
    expect(screen.queryByText('X')).toBeNull()
    expect(screen.queryByText('Y')).toBeNull()
  })

  it('shows the cursor block when a cursor position is set', () => {
    useCursorStore.setState({ x: 42, y: 99 })
    render(<StatusBar />)
    expect(valueFor('X')).toHaveTextContent('42')
    expect(valueFor('Y')).toHaveTextContent('99')
  })

  it('Set scale button toggles activeTool between select and calibrate-scale', () => {
    render(<StatusBar />)
    const btn = screen.getByRole('button', { name: 'Set scale' })

    // Starts in 'select' → not pressed.
    expect(btn).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(btn)
    expect(useCanvasStore.getState().activeTool).toBe('calibrate-scale')
    // After re-render the button should be aria-pressed=true.
    expect(screen.getByRole('button', { name: 'Set scale' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Set scale' }))
    expect(useCanvasStore.getState().activeTool).toBe('select')
  })

  it('shows a tool hint for wall / door / window and not for select', () => {
    const { rerender } = render(<StatusBar />)
    const status = screen.getByRole('status', { name: 'Canvas status' })

    // 'select' → no hint anywhere in the status bar.
    expect(within(status).queryByText(/Click to add vertices/)).toBeNull()
    expect(within(status).queryByText(/place a door/)).toBeNull()
    expect(within(status).queryByText(/place a window/)).toBeNull()

    useCanvasStore.setState({ activeTool: 'wall' } as any)
    rerender(<StatusBar />)
    expect(screen.getByText(/Click to add vertices/)).toBeInTheDocument()

    useCanvasStore.setState({ activeTool: 'door' } as any)
    rerender(<StatusBar />)
    expect(screen.getByText(/place a door/)).toBeInTheDocument()

    useCanvasStore.setState({ activeTool: 'window' } as any)
    rerender(<StatusBar />)
    expect(screen.getByText(/place a window/)).toBeInTheDocument()
  })

  it('Occupancy accent reflects the health threshold', () => {
    // Each branch seeds a fresh element set, mounts a fresh tree, then
    // unmounts — re-using `rerender` after `unmount()` throws in React 18.
    const cases: Array<{
      name: string
      elements: Record<string, CanvasElement>
      includes: string
      excludes?: string[]
    }> = [
      // 1 of 1 → 100% → red
      {
        name: 'red @ 100%',
        elements: { d1: desk('d1', 'e1') },
        includes: 'text-red-600',
      },
      // 4 of 5 → 80% → amber
      {
        name: 'amber @ 80%',
        elements: {
          d1: desk('d1', 'e1'),
          d2: desk('d2', 'e2'),
          d3: desk('d3', 'e3'),
          d4: desk('d4', 'e4'),
          d5: desk('d5', null),
        },
        includes: 'text-amber-600',
      },
      // 3 of 5 → 60% → green
      {
        name: 'green @ 60%',
        elements: {
          d1: desk('d1', 'e1'),
          d2: desk('d2', 'e2'),
          d3: desk('d3', 'e3'),
          d4: desk('d4', null),
          d5: desk('d5', null),
        },
        includes: 'text-green-600',
      },
      // 1 of 5 → 20% → pale (no accent)
      {
        name: 'pale @ 20%',
        elements: {
          d1: desk('d1', 'e1'),
          d2: desk('d2', null),
          d3: desk('d3', null),
          d4: desk('d4', null),
          d5: desk('d5', null),
        },
        includes: 'text-gray-700',
        excludes: ['text-green-600', 'text-amber-600', 'text-red-600'],
      },
    ]

    for (const c of cases) {
      useElementsStore.setState({ elements: c.elements } as any)
      const { unmount } = render(<StatusBar />)
      const cls = valueFor('Occupancy').className
      expect(cls, c.name).toContain(c.includes)
      for (const ex of c.excludes ?? []) {
        expect(cls, c.name).not.toContain(ex)
      }
      unmount()
    }
  })
})
