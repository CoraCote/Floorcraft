import { useEffect, useRef, useState } from 'react'

/**
 * Polls `/version.json` on a fixed cadence and reports whether a newer
 * build has gone live since this tab loaded its bundle.
 *
 * # How the signal works
 *
 * `vite.config.ts` writes two coordinated artifacts on every production
 * build:
 *
 *   - The bundle gets `__BUILD_ID__` baked in via `define`.
 *   - `dist/version.json` is written with the same `buildId`.
 *
 * The CDN serves both. When a new deploy goes live, the freshly fetched
 * `version.json` carries the new id while THIS tab is still running the
 * old bundle's `__BUILD_ID__`. The mismatch is the "new version is
 * available" signal — the user can refresh whenever they're ready.
 *
 * # Why we don't auto-refresh
 *
 * Surprise reloads while a user is editing would lose unsaved work and
 * scroll position. The banner that consumes this hook offers a manual
 * Refresh button instead, and the consumer can additionally gate it on
 * the editor's autosave state being idle.
 *
 * # Local dev
 *
 * In `vite dev` the constants are still defined (config-load time runs
 * regardless), but `/version.json` doesn't exist on the dev server —
 * the fetch will 404 and we'll silently stay in `'unknown'` state. The
 * `enabled` option (defaulting to "production-only") keeps the timer
 * from spinning at all on localhost so dev consoles aren't noisy.
 */

export type BuildVersionState =
  | { status: 'unknown'; currentBuildId: string }
  | { status: 'matched'; currentBuildId: string; serverBuildId: string }
  | { status: 'new-version'; currentBuildId: string; serverBuildId: string }

export interface UseBuildVersionOptions {
  /**
   * Poll interval in milliseconds. Defaults to 60s — fast enough that
   * "I just merged, when does the banner appear?" is < 1 minute, slow
   * enough that we're not pinging the CDN every few seconds.
   */
  intervalMs?: number
  /**
   * Grace period after mount before the first poll fires. Prevents a
   * cold-load race where the user lands on the page just as the CDN
   * has rotated to the new file: the bundle is the OLD one (CloudFront
   * cached at fetch time) but `version.json` already shows the NEW id,
   * which would flash a "new version" banner immediately on load.
   */
  initialDelayMs?: number
  /**
   * Master switch. Defaults to true in production, false in dev. Pass
   * `false` to disable for tests or feature-flagged contexts.
   */
  enabled?: boolean
  /**
   * Override the URL we poll. Tests can point at a stub.
   */
  url?: string
  /**
   * The currently-running bundle's build id. Defaults to the
   * compile-time `__BUILD_ID__`. Tests inject a value directly.
   */
  currentBuildId?: string
  /**
   * Optional override for the timer scheduler. Tests pass fake
   * implementations to drive the loop deterministically.
   */
  scheduler?: {
    setTimeout: (fn: () => void, ms: number) => unknown
    clearTimeout: (handle: unknown) => void
  }
  /**
   * Optional override for `fetch` — same shape, lets tests stub
   * responses without monkey-patching globals.
   */
  fetcher?: typeof fetch
}

/**
 * Default for `enabled` — only poll in production builds. Vite's
 * `import.meta.env.PROD` is true for `vite build` artifacts and false
 * for `vite dev` / vitest.
 */
function defaultEnabled(): boolean {
  return Boolean(import.meta.env?.PROD)
}

interface VersionPayload {
  buildId?: string
  gitSha?: string
  builtAt?: string
}

export function useBuildVersion(
  options: UseBuildVersionOptions = {},
): BuildVersionState {
  const {
    intervalMs = 60_000,
    initialDelayMs = 30_000,
    enabled = defaultEnabled(),
    url = '/version.json',
    currentBuildId = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'unknown',
    scheduler,
    fetcher,
  } = options

  const [state, setState] = useState<BuildVersionState>({
    status: 'unknown',
    currentBuildId,
  })

  // Stash the latest options/state in refs so the effect cleanup can
  // see them without re-subscribing on every render.
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    cancelledRef.current = false
    const set: (fn: () => void, ms: number) => unknown =
      scheduler?.setTimeout ??
      ((fn, ms) => globalThis.setTimeout(fn, ms))
    const clear: (handle: unknown) => void =
      scheduler?.clearTimeout ??
      ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>))
    const doFetch = fetcher ?? globalThis.fetch
    let handle: unknown = null

    async function poll() {
      if (cancelledRef.current) return
      try {
        const res = await doFetch(url, { cache: 'no-store' })
        if (!res.ok) {
          // 404 in dev (no version.json on the dev server) or a
          // transient CDN edge — leave state untouched and try again
          // next tick rather than flashing 'unknown' on top of a known
          // 'matched'.
          schedule(intervalMs)
          return
        }
        const payload = (await res.json()) as VersionPayload
        const serverBuildId = payload.buildId ?? null
        if (cancelledRef.current) return
        if (typeof serverBuildId !== 'string' || serverBuildId.length === 0) {
          schedule(intervalMs)
          return
        }
        if (serverBuildId === currentBuildId) {
          setState({
            status: 'matched',
            currentBuildId,
            serverBuildId,
          })
        } else {
          // Once we've seen a divergence, stop polling — the banner is
          // now visible and any further polls would be wasted (the
          // user's bundle isn't getting any newer until they refresh).
          setState({
            status: 'new-version',
            currentBuildId,
            serverBuildId,
          })
          return
        }
      } catch {
        // Network blip — stay in current state, try again on schedule.
      }
      schedule(intervalMs)
    }

    function schedule(ms: number) {
      if (cancelledRef.current) return
      handle = set(poll, ms)
    }

    schedule(initialDelayMs)

    return () => {
      cancelledRef.current = true
      if (handle != null) clear(handle)
    }
  }, [
    enabled,
    intervalMs,
    initialDelayMs,
    url,
    currentBuildId,
    scheduler,
    fetcher,
  ])

  return state
}
