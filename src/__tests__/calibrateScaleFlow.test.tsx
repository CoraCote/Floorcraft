/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useCanvasStore } from '../stores/canvasStore'
import { useCalibrateScaleStore } from '../stores/calibrateScaleStore'
import { CalibrateScaleModal } from '../components/editor/CalibrateScaleModal'

beforeEach(() => {
  // Reset relevant store slices between tests so leaks from one
  // test can't poison assertions in another.
  useCanvasStore.setState({
    activeTool: 'select',
    settings: {
      ...useCanvasStore.getState().settings,
      scale: 1,
      scaleUnit: 'px',
    },
  })
  useCalibrateScaleStore.getState().reset()
})

describe('two-click calibrator flow', () => {
  it('entering the tool arms the session and sets activeTool to calibrate-scale', () => {
    act(() => {
      useCanvasStore.getState().setActiveTool('calibrate-scale')
      useCalibrateScaleStore.getState().begin()
    })
    expect(useCanvasStore.getState().activeTool).toBe('calibrate-scale')
    expect(useCalibrateScaleStore.getState().status).toBe('awaiting-first')
  })

  it('records two clicks and transitions to awaiting-distance', () => {
    act(() => {
      useCalibrateScaleStore.getState().begin()
      useCalibrateScaleStore.getState().clickAt(10, 10)
    })
    expect(useCalibrateScaleStore.getState().status).toBe('awaiting-second')
    expect(useCalibrateScaleStore.getState().firstPoint).toEqual({ x: 10, y: 10 })

    act(() => {
      useCalibrateScaleStore.getState().clickAt(210, 10)
    })
    expect(useCalibrateScaleStore.getState().status).toBe('awaiting-distance')
    expect(useCalibrateScaleStore.getState().secondPoint).toEqual({ x: 210, y: 10 })
  })

  it('submitting a real distance updates the canvas scale and resets the tool', () => {
    act(() => {
      useCalibrateScaleStore.getState().begin()
      useCalibrateScaleStore.getState().clickAt(0, 0)
      useCalibrateScaleStore.getState().clickAt(200, 0) // 200 px apart
    })

    render(<CalibrateScaleModal />)
    // Modal should be visible now that status is awaiting-distance
    const input = screen.getByLabelText(/distance/i) as HTMLInputElement
    const unitSelect = screen.getByLabelText(/unit/i) as HTMLSelectElement

    fireEvent.change(input, { target: { value: '10' } })
    fireEvent.change(unitSelect, { target: { value: 'ft' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))

    // 200 px claimed to be 10 ft → scale 0.05 ft/px
    expect(useCanvasStore.getState().settings.scale).toBeCloseTo(0.05, 10)
    expect(useCanvasStore.getState().settings.scaleUnit).toBe('ft')
    // Tool should return to select after a successful calibration
    expect(useCanvasStore.getState().activeTool).toBe('select')
    // Session reset
    expect(useCalibrateScaleStore.getState().status).toBe('idle')
  })

  it('cancel button aborts the session without touching the scale', () => {
    act(() => {
      useCalibrateScaleStore.getState().begin()
      useCalibrateScaleStore.getState().clickAt(0, 0)
      useCalibrateScaleStore.getState().clickAt(100, 0)
    })
    render(<CalibrateScaleModal />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    // Scale unchanged
    expect(useCanvasStore.getState().settings.scale).toBe(1)
    expect(useCanvasStore.getState().settings.scaleUnit).toBe('px')
    // Session gone
    expect(useCalibrateScaleStore.getState().status).toBe('idle')
  })

  it('invalid distance (zero / negative / non-numeric) blocks submit', () => {
    act(() => {
      useCalibrateScaleStore.getState().begin()
      useCalibrateScaleStore.getState().clickAt(0, 0)
      useCalibrateScaleStore.getState().clickAt(100, 0)
    })
    render(<CalibrateScaleModal />)
    const input = screen.getByLabelText(/distance/i) as HTMLInputElement
    const applyBtn = screen.getByRole('button', { name: /apply/i })

    fireEvent.change(input, { target: { value: '0' } })
    expect(applyBtn).toBeDisabled()

    fireEvent.change(input, { target: { value: '-5' } })
    expect(applyBtn).toBeDisabled()

    fireEvent.change(input, { target: { value: '' } })
    expect(applyBtn).toBeDisabled()
  })

  it('clicking twice on the same pixel is rejected (zero-distance guard)', () => {
    act(() => {
      useCalibrateScaleStore.getState().begin()
      useCalibrateScaleStore.getState().clickAt(50, 50)
      // Second click at exactly the same spot — store must NOT advance
      useCalibrateScaleStore.getState().clickAt(50, 50)
    })
    // Still waiting for a distinct second point
    expect(useCalibrateScaleStore.getState().status).toBe('awaiting-second')
    expect(useCalibrateScaleStore.getState().secondPoint).toBeNull()
  })

  it('reset() returns to idle and clears both points', () => {
    act(() => {
      useCalibrateScaleStore.getState().begin()
      useCalibrateScaleStore.getState().clickAt(1, 2)
      useCalibrateScaleStore.getState().clickAt(3, 4)
      useCalibrateScaleStore.getState().reset()
    })
    expect(useCalibrateScaleStore.getState().status).toBe('idle')
    expect(useCalibrateScaleStore.getState().firstPoint).toBeNull()
    expect(useCalibrateScaleStore.getState().secondPoint).toBeNull()
  })
})
