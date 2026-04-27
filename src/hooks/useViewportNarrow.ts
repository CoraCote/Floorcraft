import { useEffect, useState } from 'react'

/**
 * Reactive media-query hook for "is this viewport narrower than X
 * pixels right now". Used by responsive shells and view-mode defaults
 * across the app.
 *
 * Why a hook (not a CSS-only rule): a few flows need to make a real
 * choice based on width — the editor desktop-only gate (`lg = 1024`)
 * decides whether to render the canvas at all, and the roster default
 * view mode picks `cards` on phones so the table doesn't spill out.
 * Doing this in CSS-with-media-queries leaves the React tree in the
 * wrong shape and causes the un-rendered branch to consume props /
 * effects.
 *
 * Defensive in non-browser environments (SSR / pre-jsdom test setup):
 * returns `false` and never installs a listener.
 *
 * Note: does NOT mirror `prefers-reduced-motion` — purely viewport
 * width. Animations on the gate / hamburger drawer call
 * `prefersReducedMotion()` separately and short-circuit transitions
 * when the OS asks for reduced motion.
 */
export function useViewportNarrow(maxPx: number): boolean {
  const [isNarrow, setIsNarrow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < maxPx
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setIsNarrow(window.innerWidth < maxPx)
    window.addEventListener('resize', onResize)
    // Run once on mount in case the threshold changed between render
    // and effect (rare but cheap).
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [maxPx])
  return isNarrow
}

/**
 * Common breakpoint constants matching Tailwind v4's defaults so a
 * caller can write `useViewportNarrow(BREAKPOINT.lg)` instead of a
 * magic number. Values are pure pixels (Tailwind v4 still uses px for
 * breakpoint thresholds even when sizing tokens are rem).
 */
export const BREAKPOINT = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const
