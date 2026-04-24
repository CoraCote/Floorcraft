/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CanvasActionDock } from '../components/editor/Canvas/CanvasActionDock'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'

beforeEach(() => {
  // Reset both stores to a known baseline so tests don't bleed state.
  useCanvasStore.setState({
    stageX: 0,
    stageY: 0,
    stageScale: 1,
    stageWidth: 800,
    stageHeight: 600,
    settings: { ...DEFAULT_CANVAS_SETTINGS },
    activeTool: 'select',
  } as any)
  useUIStore.setState({
    presentationMode: false,
    minimapVisible: true,
  } as any)
})

describe('CanvasActionDock', () => {
  it('renders all eight action buttons with proper aria-labels', () => {
    render(<CanvasActionDock />)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fit to content' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle grid' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle minimap' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Presentation mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument()
  })

  it('calls zoomIn when the Zoom in button is clicked', async () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'zoomIn')
    render(<CanvasActionDock />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(spy).toHaveBeenCalledOnce()
  })

  it('calls zoomOut when the Zoom out button is clicked', async () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'zoomOut')
    render(<CanvasActionDock />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(spy).toHaveBeenCalledOnce()
  })

  it('calls zoomToContent when Fit to content is clicked', async () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'zoomToContent')
    render(<CanvasActionDock />)
    fireEvent.click(screen.getByRole('button', { name: 'Fit to content' }))
    expect(spy).toHaveBeenCalledOnce()
  })

  it('calls resetZoom when Reset view is clicked', async () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'resetZoom')
    render(<CanvasActionDock />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(spy).toHaveBeenCalledOnce()
  })

  it('calls toggleGrid and reflects showGrid in aria-pressed', async () => {
    const spy = vi.spyOn(useCanvasStore.getState(), 'toggleGrid')
    const { rerender } = render(<CanvasActionDock />)
    const btn = screen.getByRole('button', { name: 'Toggle grid' })
    // Default settings have showGrid = true.
    expect(btn).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(btn)
    expect(spy).toHaveBeenCalledOnce()

    useCanvasStore.setState({
      settings: { ...DEFAULT_CANVAS_SETTINGS, showGrid: false },
    } as any)
    rerender(<CanvasActionDock />)
    expect(screen.getByRole('button', { name: 'Toggle grid' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('calls toggleMinimap and reflects minimapVisible in aria-pressed', async () => {
    const spy = vi.spyOn(useUIStore.getState(), 'toggleMinimap')
    const { rerender } = render(<CanvasActionDock />)
    const btn = screen.getByRole('button', { name: 'Toggle minimap' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(btn)
    expect(spy).toHaveBeenCalledOnce()

    useUIStore.setState({ minimapVisible: false } as any)
    rerender(<CanvasActionDock />)
    expect(screen.getByRole('button', { name: 'Toggle minimap' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('enters presentation mode via setPresentationMode(true)', async () => {
    const spy = vi.spyOn(useUIStore.getState(), 'setPresentationMode')
    render(<CanvasActionDock />)
    fireEvent.click(screen.getByRole('button', { name: 'Presentation mode' }))
    expect(spy).toHaveBeenCalledWith(true)
  })

  it('renders nothing when presentation mode is on', () => {
    useUIStore.setState({ presentationMode: true } as any)
    const { container } = render(<CanvasActionDock />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the zoom percent rounded from stageScale', () => {
    useCanvasStore.setState({ stageScale: 1.234 } as any)
    const { rerender } = render(<CanvasActionDock />)
    expect(screen.getByText('123%')).toBeInTheDocument()

    useCanvasStore.setState({ stageScale: 0.5 } as any)
    rerender(<CanvasActionDock />)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })
})
