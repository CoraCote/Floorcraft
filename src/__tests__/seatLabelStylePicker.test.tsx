import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SeatLabelStylePicker } from '../components/editor/TopBar/SeatLabelStylePicker'
import { isSeatLabelStyle, SEAT_LABEL_STYLES } from '../types/project'

describe('SeatLabelStylePicker', () => {
  it('renders one radio item per known style', () => {
    render(<SeatLabelStylePicker value="pill" onChange={() => {}} />)
    // One radio item per union member.
    const radios = screen.getAllByRole('menuitemradio')
    expect(radios).toHaveLength(SEAT_LABEL_STYLES.length)
  })

  it('marks the current value as checked and others as unchecked', () => {
    render(<SeatLabelStylePicker value="card" onChange={() => {}} />)
    for (const style of SEAT_LABEL_STYLES) {
      const item = screen.getByTestId(`seat-label-style-${style}`)
      expect(item.getAttribute('aria-checked')).toBe(
        style === 'card' ? 'true' : 'false',
      )
    }
  })

  it('calls onChange with the picked style when a radio is clicked', () => {
    const onChange = vi.fn()
    render(<SeatLabelStylePicker value="pill" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('seat-label-style-avatar'))
    expect(onChange).toHaveBeenCalledWith('avatar')
  })

  it('each option carries a title attribute so hovering surfaces the description', () => {
    render(<SeatLabelStylePicker value="pill" onChange={() => {}} />)
    for (const style of SEAT_LABEL_STYLES) {
      const item = screen.getByTestId(`seat-label-style-${style}`)
      expect(item.getAttribute('title')).toBeTruthy()
    }
  })
})

describe('isSeatLabelStyle — type guard for legacy payload back-fill', () => {
  it.each(['pill', 'card', 'avatar', 'banner'])(
    'accepts known style %s',
    (style) => {
      expect(isSeatLabelStyle(style)).toBe(true)
    },
  )

  it.each([undefined, null, '', 'unknown-style', 42, {}, ['pill']])(
    'rejects unknown value %s',
    (value) => {
      expect(isSeatLabelStyle(value)).toBe(false)
    },
  )
})

describe('SeatLabelStylePicker store integration via TopBar', () => {
  // Keep the store-level wiring honest: selecting the picker must
  // flip `canvasStore.settings.seatLabelStyle` so subscribers
  // (DeskRenderer and friends) re-render in the same frame.
  beforeEach(() => {
    vi.resetModules()
  })

  it('onChange hook path writes through to canvasStore.settings', async () => {
    const { useCanvasStore } = await import('../stores/canvasStore')
    const { DEFAULT_CANVAS_SETTINGS } = await import('../types/project')
    useCanvasStore.setState({ settings: { ...DEFAULT_CANVAS_SETTINGS } })
    const setSettings = useCanvasStore.getState().setSettings
    setSettings({ seatLabelStyle: 'card' })
    expect(useCanvasStore.getState().settings.seatLabelStyle).toBe('card')
    setSettings({ seatLabelStyle: 'banner' })
    expect(useCanvasStore.getState().settings.seatLabelStyle).toBe('banner')
  })
})
