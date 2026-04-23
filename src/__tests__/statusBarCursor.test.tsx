/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBar } from '../components/editor/StatusBar'
import { useCursorStore } from '../stores/cursorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useCanvasStore } from '../stores/canvasStore'

beforeEach(() => {
  useCursorStore.setState({ x: null, y: null })
  useElementsStore.setState({ elements: {} } as any)
  useUIStore.setState({ selectedIds: [] } as any)
  useCanvasStore.setState({ stageScale: 1, activeTool: 'select' } as any)
})

/**
 * The coordinate readout is the visible half of the cursor store. The
 * store already has its own tests for rounding + dedupe; here we
 * assert the rendering contract — that the status bar reflects the
 * cursor position when set and hides it when cleared.
 */
describe('StatusBar cursor coordinate readout', () => {
  it('does not render an X/Y readout when the cursor is off the canvas', () => {
    render(<StatusBar />)
    // The rest of the status bar still renders (Desks/Zoom/etc), but
    // no "X:" label should appear.
    expect(screen.queryByText(/^X:/)).toBeNull()
  })

  it('renders the cursor coordinates when the cursor is over the canvas', () => {
    useCursorStore.setState({ x: 42, y: 99 })
    render(<StatusBar />)
    const readout = screen.getByTitle('Cursor position (world units)')
    expect(readout).toHaveTextContent('X: 42')
    expect(readout).toHaveTextContent('Y: 99')
  })

  it('removes the readout when the cursor is cleared (pointer leaves canvas)', () => {
    useCursorStore.setState({ x: 10, y: 20 })
    const { rerender } = render(<StatusBar />)
    expect(screen.getByTitle('Cursor position (world units)')).toBeInTheDocument()

    useCursorStore.setState({ x: null, y: null })
    rerender(<StatusBar />)
    expect(screen.queryByTitle('Cursor position (world units)')).toBeNull()
  })
})
