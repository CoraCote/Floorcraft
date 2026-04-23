import { describe, it, expect, beforeEach } from 'vitest'
import { useCursorStore } from '../stores/cursorStore'

/**
 * The cursor store is intentionally minimal, but it has one piece of
 * real behavior worth locking down: rounding + dedupe. Pointers emit
 * lots of sub-pixel moves, and without the "skip if rounded coords are
 * unchanged" guard every stationary hover would still trigger a
 * re-render in the status bar. Verify that guard actually works.
 */
describe('cursorStore', () => {
  beforeEach(() => {
    useCursorStore.setState({ x: null, y: null })
  })

  it('initial state is null / null (hidden)', () => {
    const { x, y } = useCursorStore.getState()
    expect(x).toBeNull()
    expect(y).toBeNull()
  })

  it('setCursor rounds coordinates to integers', () => {
    useCursorStore.getState().setCursor(12.4, 7.9)
    const { x, y } = useCursorStore.getState()
    expect(x).toBe(12)
    expect(y).toBe(8)
  })

  it('setCursor short-circuits when rounded coords are unchanged', () => {
    useCursorStore.getState().setCursor(10, 20)

    // Subscribe after the initial set so we can count subsequent
    // notifications without the first one polluting the total.
    let notifications = 0
    const unsubscribe = useCursorStore.subscribe(() => {
      notifications += 1
    })

    // Same rounded value → no notification.
    useCursorStore.getState().setCursor(10.2, 19.8)
    // Different rounded value → notification.
    useCursorStore.getState().setCursor(11, 20)

    unsubscribe()
    expect(notifications).toBe(1)
  })

  it('clearCursor resets to null / null', () => {
    useCursorStore.getState().setCursor(5, 5)
    useCursorStore.getState().clearCursor()
    const { x, y } = useCursorStore.getState()
    expect(x).toBeNull()
    expect(y).toBeNull()
  })

  it('clearCursor is a no-op when already cleared (no re-render)', () => {
    let notifications = 0
    const unsubscribe = useCursorStore.subscribe(() => {
      notifications += 1
    })

    useCursorStore.getState().clearCursor()

    unsubscribe()
    expect(notifications).toBe(0)
  })
})
