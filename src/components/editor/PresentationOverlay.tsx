import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { prefersReducedMotion } from '../../lib/prefersReducedMotion'
import { usePresentationShortcuts } from '../../hooks/usePresentationShortcuts'

/**
 * Wave 11B: presentation-mode chrome.
 *
 * Owns four pieces of UI that only matter while `presentationMode === true`:
 *
 * 1. A bottom-right "Presentation · Esc to exit" pill — quiet (70% opacity)
 *    by default, fades to full opacity on mouse move and back after 1.5s,
 *    so the presenter has a reminder when they fidget but it doesn't
 *    distract from the floor plan during a static demo.
 *
 * 2. A top-right `×` exit button. Same fade-on-mouse-move behavior as the
 *    pill, but additionally only revealed when the cursor is near the
 *    top-right corner — so it doesn't sit on top of the canvas as
 *    permanent visual debt.
 *
 * 3. A first-run hint toast next to the floor switcher area: "Use ← → to
 *    switch floors", gated behind a localStorage flag so subsequent
 *    presentations don't repeat it. Auto-dismisses after 5s or on any
 *    keystroke.
 *
 * 4. Browser fullscreen API integration: requesting fullscreen on entry,
 *    exiting fullscreen on exit, and listening for the user exiting
 *    fullscreen via Esc / browser chrome to keep our state in sync.
 *
 * Reduced-motion users get nothing decorative — the indicator and exit
 * button are hidden entirely (Esc and the standard P shortcut still work,
 * which we surface elsewhere via the toast when first entering).
 *
 * Mounted once from `MapView`, but only does anything when presentation
 * mode is on. Returns `null` outside presentation mode so the canvas
 * isn't paying for fade-timer refs while in normal editing.
 */
export function PresentationOverlay() {
  const presentationMode = useUIStore((s) => s.presentationMode)
  const setPresentationMode = useUIStore((s) => s.setPresentationMode)

  // Mount the floor-arrow shortcut hook unconditionally — it self-gates on
  // `presentationMode` at event time, so a single global listener is fine.
  usePresentationShortcuts()

  // Fullscreen API. When entering presentation mode, request fullscreen;
  // when leaving, exit fullscreen if we're still in it. The
  // `fullscreenchange` listener flips presentation mode back off if the
  // user dismisses fullscreen via Esc (some browsers eat Esc themselves
  // before our keydown listener sees it) or the browser chrome's exit
  // button — keeping the two states in sync prevents a confused
  // "presentation chrome but no fullscreen" intermediate.
  useEffect(() => {
    if (typeof document === 'undefined') return

    if (presentationMode) {
      // requestFullscreen returns a promise that rejects if the API is
      // unavailable, blocked by permissions policy, or not invoked from a
      // user gesture in some browsers. We fall back silently — staying in
      // presentation mode without fullscreen is still a usable
      // demonstration mode.
      try {
        const req = document.documentElement.requestFullscreen?.()
        if (req && typeof req.catch === 'function') req.catch(() => {})
      } catch {
        /* ignore */
      }
    } else if (document.fullscreenElement) {
      try {
        const exit = document.exitFullscreen?.()
        if (exit && typeof exit.catch === 'function') exit.catch(() => {})
      } catch {
        /* ignore */
      }
    }
  }, [presentationMode])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const handler = () => {
      // If we're in presentation mode and the user exited fullscreen
      // (Esc on the browser's native fullscreen prompt, F11, etc.), drop
      // out of presentation too. Don't trigger the inverse — entering
      // fullscreen via DevTools shouldn't force presentation mode on.
      if (!document.fullscreenElement && useUIStore.getState().presentationMode) {
        useUIStore.getState().setPresentationMode(false)
      }
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  if (!presentationMode) return null

  return <PresentationOverlayContent onExit={() => setPresentationMode(false)} />
}

/**
 * Inner body separated so the mouse-move / fade-timer state only initializes
 * when presentation mode is actually on. Means we don't pay the cost of a
 * pointermove listener during normal editing.
 */
function PresentationOverlayContent({ onExit }: { onExit: () => void }) {
  const reduceMotion = prefersReducedMotion()
  const [active, setActive] = useState(false)
  const [cursorNearTopRight, setCursorNearTopRight] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (reduceMotion) return
    const handler = (e: PointerEvent) => {
      setActive(true)
      // Top-right proximity sentinel for the corner exit button. ~200px
      // both directions matches "fingertip already drifting toward the
      // close-window corner"; smaller and the button feels hidden, larger
      // and it shows up while panning the canvas with the mouse.
      const w = window.innerWidth
      setCursorNearTopRight(e.clientX > w - 200 && e.clientY < 200)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
      fadeTimerRef.current = setTimeout(() => {
        setActive(false)
        setCursorNearTopRight(false)
      }, 1500)
    }
    window.addEventListener('pointermove', handler)
    return () => {
      window.removeEventListener('pointermove', handler)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [reduceMotion])

  if (reduceMotion) {
    // No decorative indicator. We still render an off-screen,
    // keyboard-reachable exit button so Tab users have a way out without
    // relying on Esc or P. The button is visually hidden but accessible.
    return (
      <div aria-live="polite" className="contents">
        <FirstRunHint />
        <button
          onClick={onExit}
          className="fixed top-4 right-4 z-[60] sr-only focus:not-sr-only focus:px-3 focus:py-2 focus:rounded-md focus:bg-gray-900 focus:text-white focus:text-sm focus:font-medium focus:shadow-lg"
          aria-label="Exit presentation mode"
        >
          Exit presentation mode
        </button>
      </div>
    )
  }

  return (
    <>
      <FirstRunHint />

      {/*
        Bottom-right indicator pill. `aria-label` rather than relying on
        the visible text means screen-reader users get a clean
        "Presentation mode" announcement instead of the keyboard hint
        glyphs. Pointer-events disabled — it's purely informational and
        we don't want it eating clicks on the canvas behind it.
      */}
      <div
        role="status"
        aria-label="Presentation mode"
        className={`fixed bottom-4 right-4 z-[60] pointer-events-none px-3 py-1.5 rounded-full bg-gray-900/80 text-white text-xs font-medium shadow-lg backdrop-blur-sm transition-opacity duration-300 ${
          active ? 'opacity-100' : 'opacity-70'
        }`}
      >
        <span className="text-gray-200">Presentation</span>
        <span className="mx-1.5 text-gray-500">·</span>
        <span className="text-gray-300">Esc to exit</span>
      </div>

      {/*
        Corner exit button. Hidden by default, faded in only when the
        cursor is near the top-right corner OR when keyboard focus
        lands on it (focus-within is the explicit Tab affordance — Tab
        from anywhere in the body lands here first). Esc still exits via
        the central keydown handler, so this is mostly for trackpad/touch
        users without a keyboard.
      */}
      <button
        onClick={onExit}
        className={`fixed top-4 right-4 z-[60] w-9 h-9 rounded-full bg-gray-900/80 hover:bg-gray-900 text-white text-base shadow-lg backdrop-blur-sm flex items-center justify-center transition-opacity duration-300 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
          cursorNearTopRight || active ? 'opacity-100' : 'opacity-0'
        }`}
        aria-label="Exit presentation mode"
        title="Exit presentation mode (Esc)"
      >
        <span aria-hidden="true">×</span>
      </button>
    </>
  )
}

const HINT_STORAGE_KEY = 'floorcraft.presentationHintSeen'

/**
 * One-shot tooltip pointing the operator at the new arrow-key floor
 * navigation. Renders only on the very first time a user enters
 * presentation mode on this device — gated by a localStorage flag set
 * the moment the hint mounts so a quick double-toggle doesn't show it
 * twice. Auto-dismisses after 5 seconds or on any keystroke (so pressing
 * an arrow to actually use the hinted-at feature also clears the hint).
 *
 * Anchored top-left because the FloorSwitcher tab strip sits at the top
 * of the viewport in normal editing mode; in presentation mode the
 * switcher is hidden, but the natural eye-line for "where are the
 * floors?" is still up there.
 */
function FirstRunHint() {
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HINT_STORAGE_KEY) !== '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!visible) return
    try {
      localStorage.setItem(HINT_STORAGE_KEY, '1')
    } catch {
      /* ignore storage failure — worst case the hint shows again next time */
    }

    const dismiss = () => setVisible(false)
    const timer = setTimeout(dismiss, 5000)
    window.addEventListener('keydown', dismiss, { once: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', dismiss)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed top-4 left-4 z-[60] px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium shadow-lg"
    >
      Use <kbd className="font-mono bg-white/20 px-1 rounded">←</kbd>{' '}
      <kbd className="font-mono bg-white/20 px-1 rounded">→</kbd> to switch floors
    </div>
  )
}
