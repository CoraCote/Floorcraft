import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MonitorSmartphone, X } from 'lucide-react'

const DISMISS_KEY = 'narrowScreenBannerDismissed'
const NARROW_BREAKPOINT_PX = 1024

function readInitialDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function readInitialNarrow(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < NARROW_BREAKPOINT_PX
}

/**
 * Warns map-view users whose viewport is narrower than `lg` (<1024px).
 * The editor is desktop-only — sidebars crowd the canvas below this
 * threshold. The banner offers a one-click link to the roster view
 * (which IS usable on narrow screens) plus a dismiss X that sticks
 * per-device via localStorage.
 *
 * Route-gated: the roster itself doesn't need the warning, so we only
 * render on pathnames ending in `/map`.
 */
export function NarrowScreenBanner() {
  // Function initializer avoids setState during render and keeps SSR
  // safe (window guard above). We intentionally do NOT read
  // localStorage in render, since toggling it elsewhere shouldn't
  // force a re-render of unrelated components.
  const [isNarrow, setIsNarrow] = useState<boolean>(() => readInitialNarrow())
  const [dismissed, setDismissed] = useState<boolean>(() => readInitialDismissed())
  const location = useLocation()

  useEffect(() => {
    const onResize = () => {
      setIsNarrow(window.innerWidth < NARROW_BREAKPOINT_PX)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (!location.pathname.endsWith('/map')) return null
  if (!isNarrow || dismissed) return null

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // localStorage can throw in private mode / quota full; the banner
      // still hides for this session via local state.
    }
    setDismissed(true)
  }

  return (
    <div
      className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm px-4 py-2 flex items-center gap-3"
      role="status"
    >
      <MonitorSmartphone size={16} className="flex-shrink-0" />
      <span className="flex-1">The editor works best on a larger screen.</span>
      <Link to="../roster" className="font-medium underline hover:no-underline">
        Open roster →
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss narrow-screen warning"
        className="flex-shrink-0 opacity-70 hover:opacity-100"
      >
        <X size={16} />
      </button>
    </div>
  )
}
