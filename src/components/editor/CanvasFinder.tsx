import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { useCanvasFinderStore } from '../../stores/canvasFinderStore'
import { useCanvasFinder } from '../../hooks/useCanvasFinder'

/**
 * Cmd+F finder overlay for the floor plan, modeled on JSON Crack's
 * in-visualization search. Mounts as a portal directly under
 * `document.body` so consumers can drop it anywhere in the tree
 * (ProjectShell mounts a single instance) without having to rewire
 * MapView's stacking context.
 *
 * Lifecycle:
 *
 *   1. Cmd+F (handled in `useKeyboardShortcuts`) flips
 *      `canvasFinderStore.open = true`.
 *   2. The finder mounts, runs `useCanvasFinder()` to derive matches
 *      and pan-to-match, and traps Enter / Shift+Enter / Escape locally
 *      on the input.
 *   3. Esc / X / floor swap / route change resets the store, which
 *      unmounts the body and restores the canvas opacity.
 *
 * The hook lives at the body level (not the gate) so closing the finder
 * tears down match-watching effects and we don't keep recomputing
 * matches against stores no one is reading.
 */
export function CanvasFinder() {
  const open = useCanvasFinderStore((s) => s.open)
  if (!open) return null
  return <CanvasFinderBody />
}

function CanvasFinderBody() {
  // Co-located: the finder hook owns match derivation + focus-on-cycle +
  // floor/route teardown. Mounting it here means closing the finder
  // automatically tears the side-effects down.
  useCanvasFinder()

  const query = useCanvasFinderStore((s) => s.query)
  const matches = useCanvasFinderStore((s) => s.matches)
  const activeIndex = useCanvasFinderStore((s) => s.activeIndex)
  const setQuery = useCanvasFinderStore((s) => s.setQuery)
  const closeFinder = useCanvasFinderStore((s) => s.closeFinder)
  const next = useCanvasFinderStore((s) => s.next)
  const prev = useCanvasFinderStore((s) => s.prev)

  const inputRef = useRef<HTMLInputElement | null>(null)

  // Autofocus on mount. requestAnimationFrame so the input has actually
  // landed in the DOM before we ask for focus — mirrors CommandPalette.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeFinder()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) prev()
        else next()
        return
      }
    },
    [closeFinder, next, prev],
  )

  const counterText =
    query.trim().length === 0
      ? ''
      : matches.length === 0
        ? 'No matches'
        : `${activeIndex + 1} / ${matches.length}`

  const hasMatches = matches.length > 0

  const node = (
    <div
      // Top-center floating bar over the canvas. z-30 keeps it above the
      // canvas layer but below modal dialogs (which sit at z-50).
      className="fixed top-4 left-1/2 -translate-x-1/2 z-30
                 flex items-center gap-2 px-3 py-2
                 rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur
                 border border-gray-200 dark:border-gray-800
                 shadow-lg
                 min-w-[360px] max-w-[480px]"
      role="search"
      aria-label="Find on this floor"
      data-testid="canvas-finder"
      // Stop click events from bubbling to the canvas — the user must be
      // able to click the bar to take focus / pan with middle-mouse on
      // the canvas behind it without the bar swallowing those gestures.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Search size={14} className="text-gray-400 flex-shrink-0" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find on this floor…"
        aria-label="Find on this floor"
        data-testid="canvas-finder-input"
        className="text-sm bg-transparent focus:outline-none flex-1
                   text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
      />
      <span
        className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400 flex-shrink-0"
        data-testid="canvas-finder-counter"
      >
        {counterText}
      </span>
      <button
        type="button"
        onClick={() => prev()}
        disabled={!hasMatches}
        aria-label="Previous match"
        data-testid="canvas-finder-prev"
        className="w-6 h-6 inline-flex items-center justify-center rounded
                   text-gray-500 hover:text-gray-800 hover:bg-gray-100
                   dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800
                   disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={() => next()}
        disabled={!hasMatches}
        aria-label="Next match"
        data-testid="canvas-finder-next"
        className="w-6 h-6 inline-flex items-center justify-center rounded
                   text-gray-500 hover:text-gray-800 hover:bg-gray-100
                   dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800
                   disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        onClick={() => closeFinder()}
        aria-label="Close finder"
        data-testid="canvas-finder-close"
        className="w-6 h-6 inline-flex items-center justify-center rounded
                   text-gray-500 hover:text-gray-800 hover:bg-gray-100
                   dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800"
      >
        <X size={14} />
      </button>
    </div>
  )

  // Portal to `document.body` so the bar isn't subject to MapView's
  // overflow / transform stacking.
  return createPortal(node, document.body)
}
