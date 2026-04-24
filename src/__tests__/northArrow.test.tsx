/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { NorthArrow } from '../components/editor/Canvas/NorthArrow'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'

// `useCan` proxies to the project store + permissions table. Mocking it
// directly lets each test pin the `editMap` answer without reaching for
// realistic role/membership setup. Same pattern as planHealthPill.test.tsx.
const useCanMock = vi.fn((_action: string): boolean => true)
vi.mock('../hooks/useCan', () => ({
  useCan: (action: string) => useCanMock(action),
}))

beforeEach(() => {
  useCanMock.mockImplementation(() => true)
  useCanvasStore.setState({
    settings: { ...DEFAULT_CANVAS_SETTINGS, northRotation: 0 },
  })
  useUIStore.setState({ presentationMode: false })
})

describe('NorthArrow', () => {
  it('renders the compass affordance', () => {
    render(<NorthArrow />)
    expect(screen.getByTestId('north-arrow')).toBeInTheDocument()
  })

  it('is hidden in presentation mode', () => {
    useUIStore.setState({ presentationMode: true })
    render(<NorthArrow />)
    expect(screen.queryByTestId('north-arrow')).not.toBeInTheDocument()
  })

  it('Right/Up arrow rotates clockwise by 5°', () => {
    render(<NorthArrow />)
    const arrow = screen.getByTestId('north-arrow')
    fireEvent.keyDown(arrow, { key: 'ArrowRight' })
    expect(useCanvasStore.getState().settings.northRotation).toBe(5)
    fireEvent.keyDown(arrow, { key: 'ArrowUp' })
    expect(useCanvasStore.getState().settings.northRotation).toBe(10)
  })

  it('Left/Down arrow rotates counterclockwise by 5° and wraps below zero', () => {
    render(<NorthArrow />)
    const arrow = screen.getByTestId('north-arrow')
    fireEvent.keyDown(arrow, { key: 'ArrowLeft' })
    // 0 - 5 wraps to 355
    expect(useCanvasStore.getState().settings.northRotation).toBe(355)
    fireEvent.keyDown(arrow, { key: 'ArrowDown' })
    expect(useCanvasStore.getState().settings.northRotation).toBe(350)
  })

  it('Home resets rotation to 0', () => {
    useCanvasStore.setState({
      settings: { ...useCanvasStore.getState().settings, northRotation: 137 },
    })
    render(<NorthArrow />)
    fireEvent.keyDown(screen.getByTestId('north-arrow'), { key: 'Home' })
    expect(useCanvasStore.getState().settings.northRotation).toBe(0)
  })

  it('aria-valuenow reflects current rotation', () => {
    useCanvasStore.setState({
      settings: { ...useCanvasStore.getState().settings, northRotation: 42 },
    })
    render(<NorthArrow />)
    const arrow = screen.getByTestId('north-arrow')
    expect(arrow.getAttribute('aria-valuenow')).toBe('42')
    expect(arrow.getAttribute('role')).toBe('slider')
  })

  it('is read-only when useCan(editMap) is false (no slider semantics, no key edits)', () => {
    useCanMock.mockImplementation(() => false)
    useCanvasStore.setState({
      settings: { ...useCanvasStore.getState().settings, northRotation: 30 },
    })
    render(<NorthArrow />)
    const arrow = screen.getByTestId('north-arrow')
    // No `slider` role so screen readers don't promise interactivity.
    expect(arrow.getAttribute('role')).toBeNull()
    expect(arrow.getAttribute('aria-valuenow')).toBeNull()
    // Arrow keys are no-ops.
    act(() => {
      fireEvent.keyDown(arrow, { key: 'ArrowRight' })
    })
    expect(useCanvasStore.getState().settings.northRotation).toBe(30)
  })
})
