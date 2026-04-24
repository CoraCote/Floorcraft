import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  useElementSpawnAnimation,
  __resetSpawnAnimationState,
  SPAWN_DURATION_MS,
  STAGGER_MS,
} from './useElementSpawnAnimation'

/**
 * Tests for the spawn-animation hook. The hook's two main responsibilities
 * are: (a) returning the right transform values for an element id, and
 * (b) coordinating the "already animated" set / batch stagger across
 * many concurrent calls. We exercise both via direct renderHook drives.
 *
 * matchMedia stub: jsdom doesn't ship one. Most tests want
 * `prefers-reduced-motion: reduce` to be FALSE (the default), so the
 * animation actually runs. The reduced-motion test installs a different
 * stub before importing/rendering.
 */

const ORIGINAL_MATCH_MEDIA = (globalThis as unknown as { matchMedia?: unknown }).matchMedia

function installMatchMedia(reduced: boolean) {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('reduce') ? reduced : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (globalThis as unknown as { matchMedia: (q: string) => unknown }).matchMedia,
    })
  }
}

function restoreMatchMedia() {
  if (ORIGINAL_MATCH_MEDIA === undefined) {
    delete (globalThis as unknown as { matchMedia?: unknown }).matchMedia
  } else {
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      writable: true,
      value: ORIGINAL_MATCH_MEDIA,
    })
  }
}

beforeEach(() => {
  __resetSpawnAnimationState()
  installMatchMedia(false)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  restoreMatchMedia()
  __resetSpawnAnimationState()
})

describe('useElementSpawnAnimation — reduced motion', () => {
  it('returns identity values immediately when prefers-reduced-motion is set', () => {
    installMatchMedia(true)
    const { result } = renderHook(() => useElementSpawnAnimation('a'))
    expect(result.current).toEqual({ opacity: 1, scaleX: 1, scaleY: 1 })
  })
})

describe('useElementSpawnAnimation — animation', () => {
  it('starts at opacity 0 / scale 0.92 and reaches identity after the duration', () => {
    const { result } = renderHook(() => useElementSpawnAnimation('new-1'))
    // Initial frame: nothing has been painted yet, the hook returns
    // pre-animation values so the first paint is at zero.
    expect(result.current.opacity).toBe(0)
    expect(result.current.scaleX).toBeCloseTo(0.92, 5)
    expect(result.current.scaleY).toBeCloseTo(0.92, 5)

    // Advance well past the configured duration. The rAF loop is driven
    // by fake timers via vi.advanceTimersByTime — vitest's fake timers
    // shim requestAnimationFrame onto the timer queue.
    act(() => {
      vi.advanceTimersByTime(SPAWN_DURATION_MS + 50)
    })

    expect(result.current.opacity).toBe(1)
    expect(result.current.scaleX).toBe(1)
    expect(result.current.scaleY).toBe(1)
  })

  it('returns identity values for an id that was present at first render (initial seed)', () => {
    // Seed the "already animated" set with this id. Subsequent renders
    // for the same id should NOT animate — they are part of the cold-load
    // snapshot.
    const { result } = renderHook(() =>
      useElementSpawnAnimation('seeded-1', { initialIds: ['seeded-1'] }),
    )
    expect(result.current).toEqual({ opacity: 1, scaleX: 1, scaleY: 1 })
  })

  it('does not re-animate an id that has already animated (undo/redo idempotence)', () => {
    // First mount animates.
    const first = renderHook(() => useElementSpawnAnimation('replayed'))
    act(() => {
      vi.advanceTimersByTime(SPAWN_DURATION_MS + 50)
    })
    expect(first.result.current.opacity).toBe(1)
    first.unmount()

    // Re-mount with the same id — simulates an undo+redo putting the
    // element back into the store. It must NOT animate from 0 again.
    const second = renderHook(() => useElementSpawnAnimation('replayed'))
    expect(second.result.current).toEqual({ opacity: 1, scaleX: 1, scaleY: 1 })
  })
})

describe('useElementSpawnAnimation — stagger', () => {
  it('staggers the start time of multiple ids registered in the same tick', () => {
    // Render three hooks back-to-back synchronously. They should share
    // a batch tick and each get a stagger offset of i * STAGGER_MS.
    const a = renderHook(() => useElementSpawnAnimation('stag-a'))
    const b = renderHook(() => useElementSpawnAnimation('stag-b'))
    const c = renderHook(() => useElementSpawnAnimation('stag-c'))

    // All three start at the pre-animation values.
    expect(a.result.current.opacity).toBe(0)
    expect(b.result.current.opacity).toBe(0)
    expect(c.result.current.opacity).toBe(0)

    // Advance just past `c`'s stagger offset (2 * STAGGER_MS) but still
    // well within the spawn duration. After this point `a` has been
    // animating the longest, `c` has the shortest elapsed time — so
    // a.opacity > b.opacity > c.opacity.
    act(() => {
      vi.advanceTimersByTime(2 * STAGGER_MS + 30)
    })

    expect(a.result.current.opacity).toBeGreaterThan(b.result.current.opacity)
    expect(b.result.current.opacity).toBeGreaterThan(c.result.current.opacity)
    // `c` is still in flight (or just barely started).
    expect(c.result.current.opacity).toBeLessThan(1)

    // After the full duration + the largest stagger, all three are at
    // identity.
    act(() => {
      vi.advanceTimersByTime(SPAWN_DURATION_MS + 50)
    })
    expect(a.result.current.opacity).toBe(1)
    expect(b.result.current.opacity).toBe(1)
    expect(c.result.current.opacity).toBe(1)
  })
})
