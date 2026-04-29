import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useBuildVersion } from '../hooks/useBuildVersion'

/**
 * Tests use a fake scheduler so we can drive polls deterministically
 * without ticking the real clock; the production code receives the
 * scheduler via dependency injection. `fetcher` is also injected so
 * we never touch the global `fetch` and tests stay isolated from
 * each other.
 */

interface FakeTimer {
  fn: () => void
  delay: number
  cancelled: boolean
}

function makeFakeScheduler() {
  const timers: FakeTimer[] = []
  return {
    scheduler: {
      setTimeout: (fn: () => void, ms: number) => {
        const t: FakeTimer = { fn, delay: ms, cancelled: false }
        timers.push(t)
        return t
      },
      clearTimeout: (handle: unknown) => {
        ;(handle as FakeTimer).cancelled = true
      },
    },
    timers,
    /** Fire the next pending timer (FIFO, skipping cancelled). */
    async tick() {
      while (timers.length > 0) {
        const next = timers.shift()!
        if (next.cancelled) continue
        await act(async () => {
          next.fn()
          // Let any awaited fetch promise resolve before returning.
          await Promise.resolve()
          await Promise.resolve()
        })
        return
      }
    },
  }
}

function jsonResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    json: async () => payload,
  } as unknown as Response
}

describe('useBuildVersion', () => {
  it('starts in unknown state with the bundled build id', () => {
    const { result } = renderHook(() =>
      useBuildVersion({
        enabled: true,
        currentBuildId: 'abc123-1',
        scheduler: makeFakeScheduler().scheduler,
        fetcher: vi.fn(),
      }),
    )
    expect(result.current).toEqual({
      status: 'unknown',
      currentBuildId: 'abc123-1',
    })
  })

  it('does not poll when disabled (e.g. dev mode)', async () => {
    const fetcher = vi.fn()
    const sched = makeFakeScheduler()
    renderHook(() =>
      useBuildVersion({
        enabled: false,
        currentBuildId: 'abc123-1',
        scheduler: sched.scheduler,
        fetcher,
      }),
    )
    expect(sched.timers.length).toBe(0)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('flips to "matched" when the server build id equals the bundle id', async () => {
    const sched = makeFakeScheduler()
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ buildId: 'abc123-1' }))
    const { result } = renderHook(() =>
      useBuildVersion({
        enabled: true,
        currentBuildId: 'abc123-1',
        scheduler: sched.scheduler,
        fetcher,
      }),
    )
    await sched.tick()
    await waitFor(() => expect(result.current.status).toBe('matched'))
    if (result.current.status !== 'matched') throw new Error('expected matched')
    expect(result.current.serverBuildId).toBe('abc123-1')
  })

  it('flips to "new-version" and stops polling when ids diverge', async () => {
    const sched = makeFakeScheduler()
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ buildId: 'def456-2' }))
    const { result } = renderHook(() =>
      useBuildVersion({
        enabled: true,
        currentBuildId: 'abc123-1',
        scheduler: sched.scheduler,
        fetcher,
      }),
    )
    await sched.tick()
    await waitFor(() => expect(result.current.status).toBe('new-version'))
    if (result.current.status !== 'new-version') throw new Error('expected new-version')
    expect(result.current.serverBuildId).toBe('def456-2')
    expect(result.current.currentBuildId).toBe('abc123-1')
    // After detecting a new version we deliberately stop polling — no
    // further timer should be queued by the post-divergence path.
    expect(sched.timers.filter((t) => !t.cancelled).length).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous state when fetch returns non-OK', async () => {
    const sched = makeFakeScheduler()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ buildId: 'abc123-1' })) // first ok → matched
      .mockResolvedValueOnce(jsonResponse({}, false)) // second non-ok → keep matched
    const { result } = renderHook(() =>
      useBuildVersion({
        enabled: true,
        currentBuildId: 'abc123-1',
        scheduler: sched.scheduler,
        fetcher,
      }),
    )
    await sched.tick()
    await waitFor(() => expect(result.current.status).toBe('matched'))
    await sched.tick()
    expect(result.current.status).toBe('matched')
  })

  it('keeps the previous state when fetch throws (network blip)', async () => {
    const sched = makeFakeScheduler()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ buildId: 'abc123-1' }))
      .mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() =>
      useBuildVersion({
        enabled: true,
        currentBuildId: 'abc123-1',
        scheduler: sched.scheduler,
        fetcher,
      }),
    )
    await sched.tick()
    await waitFor(() => expect(result.current.status).toBe('matched'))
    await sched.tick()
    expect(result.current.status).toBe('matched')
  })

  it('ignores payloads without a string buildId', async () => {
    const sched = makeFakeScheduler()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ wrong: 'shape' }))
      .mockResolvedValueOnce(jsonResponse({ buildId: 'abc123-1' }))
    const { result } = renderHook(() =>
      useBuildVersion({
        enabled: true,
        currentBuildId: 'abc123-1',
        scheduler: sched.scheduler,
        fetcher,
      }),
    )
    // First poll: wrong shape → state stays unknown.
    await sched.tick()
    expect(result.current.status).toBe('unknown')
    // Second poll: valid payload → matched.
    await sched.tick()
    await waitFor(() => expect(result.current.status).toBe('matched'))
  })

  it('cleans up timers on unmount', () => {
    const sched = makeFakeScheduler()
    const { unmount } = renderHook(() =>
      useBuildVersion({
        enabled: true,
        currentBuildId: 'abc123-1',
        scheduler: sched.scheduler,
        fetcher: vi.fn(),
      }),
    )
    expect(sched.timers.length).toBe(1)
    expect(sched.timers[0].cancelled).toBe(false)
    unmount()
    expect(sched.timers[0].cancelled).toBe(true)
  })

  it('passes cache: "no-store" so CDN edge caches don\'t hide a fresh deploy', async () => {
    const sched = makeFakeScheduler()
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ buildId: 'abc123-1' }))
    renderHook(() =>
      useBuildVersion({
        enabled: true,
        currentBuildId: 'abc123-1',
        scheduler: sched.scheduler,
        fetcher,
      }),
    )
    await sched.tick()
    expect(fetcher).toHaveBeenCalledWith(
      '/version.json',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })
})
