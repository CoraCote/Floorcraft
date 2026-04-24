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
      className="flex items-center justify-center h-screen w-screen bg-gray-50"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
    </div>
  )
}
