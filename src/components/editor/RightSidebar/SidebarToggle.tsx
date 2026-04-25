import { PanelRightOpen, PanelRightClose } from 'lucide-react'
import { useUIStore } from '../../../stores/uiStore'

/**
 * The right-sidebar collapse / expand control. Used to live in the
 * TopBar — moved here so it visually belongs to the panel it
 * controls. The control has two render modes:
 *
 *   - **Inline (open state)**: renders as a small button at the top-
 *     left of the sidebar's tablist row. Used by `RightSidebar.tsx`
 *     when the panel is open. The button reads as the leftmost item
 *     of the tablist header, signalling "this is how you collapse the
 *     panel" without competing with the four content tabs.
 *
 *   - **Floating (closed state)**: a small protrusion-style tab pinned
 *     to the top-right edge of the canvas area, rendered by
 *     `MapView.tsx` only when the sidebar is hidden. It looks like a
 *     pull-tab attached to the (now invisible) sidebar — an
 *     unmistakable affordance for "open the side panel".
 *
 * Both modes call into the same `setRightSidebarOpen` action so the
 * toggle stays single-source-of-truth. Keyboard / a11y is handled by
 * `<button>` defaults plus an explicit aria-label that describes the
 * resulting state ("Open right sidebar" / "Close right sidebar").
 */

interface SidebarToggleProps {
  /**
   * `'inline'` renders compactly inside the sidebar tablist (no
   * absolute positioning). `'floating'` renders as a fixed-position
   * tab on the right edge of the canvas — only used when the panel
   * is closed.
   */
  variant: 'inline' | 'floating'
}

export function SidebarToggle({ variant }: SidebarToggleProps) {
  // We only need the setter — the caller already gates which variant
  // mounts based on the open/closed state, so reading it here would
  // be redundant subscription churn.
  const setOpen = useUIStore((s) => s.setRightSidebarOpen)

  if (variant === 'floating') {
    // Closed-state pull-tab. Anchored to the top-right of the canvas
    // area via `absolute top-3 right-0`. The negative-rounding on the
    // right edge + small protrusion gives it a "tab attached to the
    // missing sidebar" feel rather than a generic floating button.
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open right sidebar"
        title="Open right sidebar"
        className="absolute top-3 right-0 z-10 flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-white dark:bg-gray-900 border border-r-0 border-gray-200 dark:border-gray-800 rounded-l-md shadow-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
        data-testid="sidebar-toggle-floating"
      >
        <PanelRightOpen size={14} aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Panel</span>
      </button>
    )
  }

  // Open-state inline collapser. Sized to match the tablist row's
  // ~40px height; a 1px right border separates it from the four
  // tabs. Hover state mirrors the tabs' own hover treatment.
  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      aria-label="Close right sidebar"
      title="Collapse panel"
      className="flex items-center justify-center w-8 px-2 py-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border-r border-gray-200 dark:border-gray-800 transition-colors flex-shrink-0"
      data-testid="sidebar-toggle-inline"
    >
      <PanelRightClose size={14} aria-hidden="true" />
    </button>
  )
}

// Hidden when only one of the two render modes is needed, so callers
// can import the named component once and pick a variant per site.
//
// The two-component pattern (vs. one component that branches on
// `useUIStore`) means the closed-state floating tab unmounts from the
// DOM entirely when the panel opens — no orphan absolute element
// hanging over the open panel — and the inline button only mounts
// inside the panel itself. Two callers, one source of truth, no
// stacking-context surprises.
