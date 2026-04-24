/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { PresentationOverlay } from '../components/editor/PresentationOverlay'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import * as seatAssignment from '../lib/seatAssignment'

/**
 * Wave 11B presentation-mode polish.
 *
 * Covers: fullscreen API integration, fullscreenchange-driven exit, the
 * arrow/Home/End floor navigation hook, and the first-run hint
 * localStorage gating + indicator a11y.
 */

function setFloors(ids: string[], activeId = ids[0]) {
  useFloorStore.setState({
    floors: ids.map((id, i) => ({ id, name: id, order: i, elements: {} })),
    activeFloorId: activeId,
  } as any)
}

let requestFullscreenSpy: ReturnType<typeof vi.fn>
let exitFullscreenSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  useUIStore.setState({ presentationMode: false } as any)

  requestFullscreenSpy = vi.fn().mockResolvedValue(undefined)
  exitFullscreenSpy = vi.fn().mockResolvedValue(undefined)

  // jsdom doesn't implement the Fullscreen API; install lightweight stubs
  // so the component's fullscreen branch can run without crashing. Each
  // test resets the spies so call counts don't leak between cases.
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    value: requestFullscreenSpy,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(document, 'exitFullscreen', {
    value: exitFullscreenSpy,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(document, 'fullscreenElement', {
    value: null,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PresentationOverlay - fullscreen integration', () => {
  it('requests fullscreen when entering presentation mode', () => {
    setFloors(['f1', 'f2'])
    render(<PresentationOverlay />)
    expect(requestFullscreenSpy).not.toHaveBeenCalled()
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    expect(requestFullscreenSpy).toHaveBeenCalledOnce()
  })

  it('exits fullscreen when leaving presentation mode while still in fullscreen', () => {
    setFloors(['f1'])
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.documentElement,
      configurable: true,
      writable: true,
    })
    act(() => {
      useUIStore.getState().setPresentationMode(false)
    })
    expect(exitFullscreenSpy).toHaveBeenCalledOnce()
  })

  it('exits presentation mode when fullscreenchange fires with no fullscreenElement', () => {
    setFloors(['f1'])
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    expect(useUIStore.getState().presentationMode).toBe(true)
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
      writable: true,
    })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(useUIStore.getState().presentationMode).toBe(false)
  })

  it('stays in presentation mode if requestFullscreen rejects', async () => {
    setFloors(['f1'])
    requestFullscreenSpy.mockRejectedValueOnce(new Error('blocked'))
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    // Drain the rejected promise's catch branch.
    await Promise.resolve()
    expect(useUIStore.getState().presentationMode).toBe(true)
  })
})

describe('PresentationOverlay - keyboard floor navigation', () => {
  it('Right arrow during presentation switches to the next floor', () => {
    setFloors(['f1', 'f2', 'f3'], 'f1')
    const spy = vi.spyOn(seatAssignment, 'switchToFloor')
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    })
    expect(spy).toHaveBeenCalledWith('f2')
  })

  it('Left arrow during presentation switches to the previous floor (wrapping)', () => {
    setFloors(['f1', 'f2', 'f3'], 'f1')
    const spy = vi.spyOn(seatAssignment, 'switchToFloor')
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    })
    // Wrap-around: from f1 (index 0) we land on the last floor.
    expect(spy).toHaveBeenCalledWith('f3')
  })

  it('Home jumps to first floor and End jumps to last floor', () => {
    setFloors(['f1', 'f2', 'f3'], 'f2')
    const spy = vi.spyOn(seatAssignment, 'switchToFloor')
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
    })
    expect(spy).toHaveBeenLastCalledWith('f1')
    // Reset active floor so End has somewhere to go.
    useFloorStore.setState({ activeFloorId: 'f1' } as any)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }))
    })
    expect(spy).toHaveBeenLastCalledWith('f3')
  })

  it('arrow keys do NOT switch floors when presentation mode is off', () => {
    setFloors(['f1', 'f2'], 'f1')
    const spy = vi.spyOn(seatAssignment, 'switchToFloor')
    render(<PresentationOverlay />)
    // presentationMode stays false
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('arrow keys ignored while typing in an input', () => {
    setFloors(['f1', 'f2'], 'f1')
    const spy = vi.spyOn(seatAssignment, 'switchToFloor')
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    })
    expect(spy).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })
})

describe('PresentationOverlay - first-run hint', () => {
  it('renders the hint on first entry into presentation mode', () => {
    setFloors(['f1'])
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    expect(screen.getByText(/to switch floors/i)).toBeInTheDocument()
  })

  it('does NOT render the hint on subsequent entries (localStorage gate)', () => {
    setFloors(['f1'])
    localStorage.setItem('floorcraft.presentationHintSeen', '1')
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    expect(screen.queryByText(/to switch floors/i)).not.toBeInTheDocument()
  })
})

describe('PresentationOverlay - mode indicator', () => {
  it('renders the indicator pill with aria-label="Presentation mode"', () => {
    setFloors(['f1'])
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    expect(screen.getByLabelText('Presentation mode')).toBeInTheDocument()
  })

  it('renders nothing when presentation mode is off', () => {
    setFloors(['f1'])
    const { container } = render(<PresentationOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('exposes a keyboard-accessible Exit button', () => {
    setFloors(['f1'])
    render(<PresentationOverlay />)
    act(() => {
      useUIStore.getState().setPresentationMode(true)
    })
    const exit = screen.getByRole('button', { name: /exit presentation mode/i })
    expect(exit).toBeInTheDocument()
    act(() => {
      exit.click()
    })
    expect(useUIStore.getState().presentationMode).toBe(false)
  })
})
