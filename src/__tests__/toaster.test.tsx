import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Toaster } from '../components/common/Toaster'
import { useToastStore, type ToastItem } from '../stores/toastStore'

// Mock the reduced-motion helper so we can toggle it per-test without
// fighting jsdom's matchMedia stub. Individual tests flip the returned
// value via the `mocked` reference at the bottom of this block.
vi.mock('../lib/prefersReducedMotion', () => ({
  prefersReducedMotion: vi.fn(() => false),
}))

import { prefersReducedMotion } from '../lib/prefersReducedMotion'

const mockedPrefersReducedMotion = vi.mocked(prefersReducedMotion)

beforeEach(() => {
  vi.useFakeTimers()
  useToastStore.setState({ items: [] })
  mockedPrefersReducedMotion.mockReturnValue(false)
})

afterEach(() => {
  vi.useRealTimers()
})

// Helper: push a toast then flush the initial enter-animation RAF so the
// component has a deterministic "entered" state for subsequent assertions.
function pushToast(item: Omit<ToastItem, 'id'>) {
  let id = ''
  act(() => {
    id = useToastStore.getState().push(item)
  })
  act(() => {
    vi.advanceTimersByTime(1)
  })
  return id
}

describe('Toaster', () => {
  it('renders each tone with its matching icon and tone marker', () => {
    render(<Toaster />)
    pushToast({ tone: 'success', title: 'Saved' })
    pushToast({ tone: 'warning', title: 'Heads up' })
    pushToast({ tone: 'error', title: 'Failed' })

    const toasts = screen.getAllByTestId('toast')
    // Store caps at 3 → the three most recent toasts render.
    expect(toasts).toHaveLength(3)
    expect(toasts.map((t) => t.getAttribute('data-tone'))).toEqual([
      'success',
      'warning',
      'error',
    ])
    // Each toast renders one decorative icon (svg) inside its icon wrapper.
    for (const t of toasts) {
      expect(t.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1)
    }
  })

  it('auto-dismisses a non-error toast after 5000ms', () => {
    render(<Toaster />)
    pushToast({ tone: 'info', title: 'Hi' })
    expect(screen.getByText('Hi')).toBeInTheDocument()
    act(() => {
      // 4999ms: still visible. 5000ms: exit animation begins. After the
      // 160ms exit, the store drops the item.
      vi.advanceTimersByTime(4999)
    })
    expect(screen.queryByText('Hi')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1 + 200) // cross the threshold + exit anim
    })
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('uses an 8000ms auto-dismiss for errors', () => {
    render(<Toaster />)
    pushToast({ tone: 'error', title: 'Boom' })
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    // Still visible at 5s (error gets the longer window).
    expect(useToastStore.getState().items).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(3000 + 200)
    })
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('pauses auto-dismiss on hover and resumes on mouse leave', () => {
    render(<Toaster />)
    pushToast({ tone: 'info', title: 'Pause me' })
    const region = screen.getByRole('region', { name: /notifications/i })

    fireEvent.mouseEnter(region)
    act(() => {
      vi.advanceTimersByTime(10000) // Well past the 5s default.
    })
    // Still here — hover froze the timer.
    expect(useToastStore.getState().items).toHaveLength(1)

    fireEvent.mouseLeave(region)
    act(() => {
      vi.advanceTimersByTime(5000 + 200)
    })
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('close button dismisses immediately', () => {
    render(<Toaster />)
    pushToast({ tone: 'info', title: 'Bye' })
    const btn = screen.getByRole('button', { name: /dismiss notification/i })
    act(() => {
      fireEvent.click(btn)
    })
    // After the exit animation completes, the store should be empty.
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(useToastStore.getState().items).toHaveLength(0)
  })

  it('exposes a labelled aria-live region', () => {
    render(<Toaster />)
    const region = screen.getByRole('region', { name: /notifications/i })
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('skips the translate transform when prefers-reduced-motion is set', () => {
    mockedPrefersReducedMotion.mockReturnValue(true)
    render(<Toaster />)
    pushToast({ tone: 'info', title: 'Hi' })
    const toast = screen.getByTestId('toast')
    expect(toast.getAttribute('data-reduced-motion')).toBe('true')
    // Inline style should NOT carry a transform when reduced-motion is on.
    expect(toast.style.transform).toBe('')
  })

  it('renders an action button that invokes the handler and dismisses', () => {
    const onClick = vi.fn()
    render(<Toaster />)
    pushToast({
      tone: 'warning',
      title: 'Conflict',
      action: { label: 'Review', onClick },
    })
    const toast = screen.getByTestId('toast')
    const actionBtn = within(toast).getByRole('button', { name: 'Review' })
    act(() => {
      fireEvent.click(actionBtn)
    })
    expect(onClick).toHaveBeenCalledOnce()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(useToastStore.getState().items).toHaveLength(0)
  })
})
