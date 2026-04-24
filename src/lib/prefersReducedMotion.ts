/**
 * Tiny helper around the `prefers-reduced-motion` media query. We use it
 * to short-circuit any decorative animations (spawn fade-in, pulse) for
 * users who have asked the OS not to move things around — accessibility
 * and motion-sickness considerations.
 *
 * The function is defensive about non-browser environments (SSR, jest
 * pre-jsdom-window) so it's safe to call from module top-level. It does
 * NOT subscribe to media-query changes — the canvas re-evaluates on the
 * next spawn, which is good enough; we don't need to retroactively
 * unwind animations that are already in flight when the user toggles
 * the OS setting mid-session.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
