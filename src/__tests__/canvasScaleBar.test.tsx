/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { CanvasScaleBar } from '../components/editor/Canvas/CanvasScaleBar'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'

beforeEach(() => {
  useCanvasStore.setState({
    stageScale: 1,
    settings: { ...DEFAULT_CANVAS_SETTINGS, scale: 10, scaleUnit: 'ft' },
  })
  useUIStore.setState({ presentationMode: false })
})

describe('CanvasScaleBar', () => {
  it('renders with a calibrated scale and a non-zero stage scale', () => {
    render(<CanvasScaleBar />)
    const bar = screen.getByTestId('canvas-scale-bar')
    expect(bar).toBeInTheDocument()
    // aria-label includes the computed nice-step label
    expect(bar.getAttribute('aria-label')).toMatch(/Scale bar: \d+ ft/)
    // Rule has a positive width
    const rule = screen.getByTestId('canvas-scale-bar-rule') as HTMLDivElement
    const px = parseFloat(rule.style.width)
    expect(px).toBeGreaterThan(0)
  })

  it('is hidden when scaleUnit is "px" (uncalibrated)', () => {
    useCanvasStore.setState({
      settings: { ...useCanvasStore.getState().settings, scaleUnit: 'px' },
    })
    render(<CanvasScaleBar />)
    expect(screen.queryByTestId('canvas-scale-bar')).not.toBeInTheDocument()
  })

  it('is hidden when scale is 0/null', () => {
    useCanvasStore.setState({
      settings: { ...useCanvasStore.getState().settings, scale: 0 },
    })
    render(<CanvasScaleBar />)
    expect(screen.queryByTestId('canvas-scale-bar')).not.toBeInTheDocument()
  })

  it('is hidden in presentation mode', () => {
    useUIStore.setState({ presentationMode: true })
    render(<CanvasScaleBar />)
    expect(screen.queryByTestId('canvas-scale-bar')).not.toBeInTheDocument()
  })

  it('recomputes the displayed nice-step label when zoom changes', () => {
    // At 1x with 10 px/ft and target ~120px, computeScaleBar lands on
    // "20 ft" (200 px on screen).
    render(<CanvasScaleBar />)
    expect(screen.getByTestId('canvas-scale-bar').getAttribute('aria-label'))
      .toMatch(/20 ft/)

    act(() => {
      useCanvasStore.setState({ stageScale: 0.5 })
    })
    // At 0.5x effective px/ft = 5; target 120px → ~24 ft → snaps to 50 ft.
    expect(screen.getByTestId('canvas-scale-bar').getAttribute('aria-label'))
      .toMatch(/50 ft/)
  })
})
