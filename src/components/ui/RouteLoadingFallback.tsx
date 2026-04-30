/**
 * Minimal, full-viewport loading indicator rendered while a lazy
 * route chunk is in flight. Intentionally dependency-free and
 * styled with Tailwind utility classes so it ships in the initial
 * bundle (not a lazy chunk) — otherwise the fallback itself would
 * need a fallback.
 */
export function RouteLoadingFallback() {
  return (
    <div
      className="flex items-center justify-center h-screen w-screen bg-[color:var(--color-paper)] dark:bg-gray-950"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      {/* Compass-rose monogram — matches the brand mark on every public
          surface. The cyan border-t spinner reads as an architect's
          drafting compass slowly tracing a circle, which feels of-a-piece
          with the Drafting Studio identity rather than the generic
          gray-600 dot the previous fallback rendered. */}
      <div className="relative h-8 w-8">
        <span className="absolute inset-0 rounded-full border-2 border-[color:var(--color-paper-line)] dark:border-gray-800" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-[color:var(--color-blueprint)] animate-spin" />
      </div>
    </div>
  )
}
