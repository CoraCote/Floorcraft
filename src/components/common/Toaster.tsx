import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useToastStore, type ToastItem, type ToastTone } from '../../stores/toastStore'
import { prefersReducedMotion } from '../../lib/prefersReducedMotion'

// Per-tone default auto-dismiss in ms. Errors linger longer so users have
// time to read + act on them; everything else follows the "toast" spec of
// ~5s that most design systems agree on (Linear, Vercel, Radix).
const DEFAULT_AUTO_DISMISS_MS = 5000
const ERROR_AUTO_DISMISS_MS = 8000

// Pointer drag threshold for swipe-to-dismiss. Below this, the toast
// springs back via the normal exit/enter transition; at or above it,
// we treat the gesture as a dismissal.
const SWIPE_DISMISS_THRESHOLD_PX = 40

// Animation durations (must match the Tailwind `duration-*` classes below).
const ENTER_MS = 180
const EXIT_MS = 160

type ToneVisual = {
  accent: string // left-border colour
  iconWrap: string
  icon: typeof CheckCircle2
}

// Tone styling: each toast gets a coloured left-border accent + tonal
// icon. The body uses neutral surface colours so the accent pops and
// dark-mode stays legible (we avoid full-bleed tonal backgrounds that
// clash with the Linear/JSON-Crack aesthetic on dark panels).
const toneVisual: Record<ToastTone, ToneVisual> = {
  success: {
    accent: 'border-l-green-500',
    iconWrap: 'text-green-600 dark:text-green-400',
    icon: CheckCircle2,
  },
  warning: {
    accent: 'border-l-amber-500',
    iconWrap: 'text-amber-600 dark:text-amber-400',
    icon: AlertTriangle,
  },
  error: {
    accent: 'border-l-red-500',
    iconWrap: 'text-red-600 dark:text-red-400',
    icon: AlertCircle,
  },
  info: {
    accent: 'border-l-blue-500',
    iconWrap: 'text-blue-600 dark:text-blue-400',
    icon: Info,
  },
}

function getAutoDismissMs(tone: ToastTone): number {
  return tone === 'error' ? ERROR_AUTO_DISMISS_MS : DEFAULT_AUTO_DISMISS_MS
}

export function Toaster() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)
  // Tracks whether the whole stack is "paused" — either because the
  // cursor is hovering or a pointer-down is active on any toast. We use
  // one flag for the whole stack (not per-toast) so hovering the most
  // recent toast to read it also freezes the older ones behind it.
  const [paused, setPaused] = useState(false)
  const reduced = prefersReducedMotion()

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      // Wave 20A: at narrow widths the toast region anchors to the
      // bottom and stretches edge-to-edge with a small gutter, so a
      // long error message doesn't get squished under `max-w-sm` on a
      // 375 px phone. At `sm+` the original right-aligned floating
      // stack returns. `inset-x-0` plus `mx-3` gives the gutters.
      className="pointer-events-none fixed bottom-3 sm:bottom-4 inset-x-0 sm:inset-x-auto sm:right-4 z-50 flex flex-col gap-2 max-w-full sm:max-w-sm mx-3 sm:mx-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {items.map((item) => (
        <ToastRow
          key={item.id}
          item={item}
          paused={paused}
          reduced={reduced}
          onDismiss={() => dismiss(item.id)}
          onPauseStart={() => setPaused(true)}
          onPauseEnd={() => setPaused(false)}
        />
      ))}
    </div>
  )
}

interface ToastRowProps {
  item: ToastItem
  paused: boolean
  reduced: boolean
  onDismiss: () => void
  onPauseStart: () => void
  onPauseEnd: () => void
}

// Single toast. Encapsulates its own enter/exit animation, swipe
// gesture, and auto-dismiss timer so the parent Toaster stays a thin
// orchestration layer over the store.
function ToastRow({ item, paused, reduced, onDismiss, onPauseStart, onPauseEnd }: ToastRowProps) {
  const { tone, title, body, action } = item
  const visual = toneVisual[tone]
  const Icon = visual.icon

  // `entered` flips true immediately after mount so the Tailwind
  // transition picks up the transform/opacity change. `exiting` plays
  // the mirrored transition before we actually call dismiss (fire the
  // store update after the animation ends).
  const [entered, setEntered] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [dragX, setDragX] = useState(0)
  // Dragging needs to drive inline styles (transform + transition) so
  // it lives in state, not a ref, to satisfy the react-hooks/refs rule.
  // A parallel ref mirrors it so synchronous pointer-move handlers read
  // the latest value before React has re-rendered.
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const pointerDownRef = useRef(false)

  // Kick off the enter transition on next frame. Using rAF rather than
  // a 0-ms timeout means the browser has actually committed the
  // initial (off-screen) styles before we flip to the in-place styles.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Schedule the auto-dismiss animation. When `paused` is true, we
  // clear the timer and reschedule on resume — no accumulated drift;
  // the remaining time just restarts from full on mouse-leave. This is
  // how Sonner/Radix handle it and is noticeably less fiddly than
  // trying to track fractional elapsed time across pauses.
  const beginExit = useCallback(() => {
    if (exiting) return
    setExiting(true)
    // Give the exit animation time to play; if reduced-motion skips
    // the visual, the fade still plays so timing is consistent.
    const hideMs = reduced ? 0 : EXIT_MS
    window.setTimeout(onDismiss, hideMs)
  }, [exiting, reduced, onDismiss])

  useEffect(() => {
    if (exiting) return
    if (paused || pointerDownRef.current) return
    const timer = window.setTimeout(beginExit, getAutoDismissMs(tone))
    return () => window.clearTimeout(timer)
  }, [paused, exiting, tone, beginExit])

  // Swipe-to-dismiss. We use pointer events + setPointerCapture so a
  // single handler covers mouse and touch uniformly. Dragging right of
  // the threshold commits to dismissal; anything less springs back.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (exiting) return
    // Ignore clicks on interactive children (close button, action).
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    pointerDownRef.current = true
    draggingRef.current = true
    setDragging(true)
    startXRef.current = e.clientX
    onPauseStart()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const dx = Math.max(0, e.clientX - startXRef.current) // only allow right-swipe
    setDragX(dx)
  }

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    pointerDownRef.current = false
    onPauseEnd()
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (dragX >= SWIPE_DISMISS_THRESHOLD_PX) {
      beginExit()
    } else {
      // Spring back to origin via the normal transition.
      setDragX(0)
    }
  }

  // Compose the transform. Enter slides from +8px; exit slides to
  // +32px (further off-screen feel). Drag overrides both while active.
  let translateX = 0
  if (dragging || dragX !== 0) {
    translateX = dragX
  } else if (exiting) {
    translateX = 32
  } else if (!entered) {
    translateX = 8
  }

  // If the user has prefers-reduced-motion, drop the translate entirely
  // (the fade alone still signals enter/exit without vestibular motion).
  const style: React.CSSProperties = {
    opacity: exiting ? 0 : entered ? 1 : 0,
    transform: reduced ? undefined : `translateX(${translateX}px)`,
    // Only transition when NOT actively dragging — during drag we want
    // the toast to track the pointer 1:1, not ease toward it.
    transition: dragging
      ? 'none'
      : exiting
        ? `opacity ${EXIT_MS}ms ease-in${reduced ? '' : `, transform ${EXIT_MS}ms ease-in`}`
        : `opacity ${ENTER_MS}ms ease-out${reduced ? '' : `, transform ${ENTER_MS}ms ease-out`}`,
  }

  return (
    <div
      role="status"
      data-testid="toast"
      data-tone={tone}
      data-reduced-motion={reduced ? 'true' : 'false'}
      className={`pointer-events-auto select-none rounded-lg border border-l-4 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 ${visual.accent}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onMouseEnter={onPauseStart}
      onMouseLeave={onPauseEnd}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span className={`mt-0.5 flex-shrink-0 ${visual.iconWrap}`} aria-hidden="true">
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {title}
          </div>
          {body && (
            <>
              <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" aria-hidden="true" />
              <div className="text-xs text-neutral-600 dark:text-neutral-400">{body}</div>
            </>
          )}
        </div>
        {action && (
          <button
            type="button"
            onClick={() => {
              action.onClick()
              beginExit()
            }}
            className="flex-shrink-0 rounded px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          onClick={beginExit}
          aria-label="Dismiss notification"
          className="flex-shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
