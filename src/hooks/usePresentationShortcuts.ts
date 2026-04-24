import { useEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import { switchToFloor } from '../lib/seatAssignment'

/**
 * Wave 11B: presentation-mode-only floor navigation shortcuts.
 *
 * Mounted once from `PresentationOverlay` so the keystrokes only intercept
 * while the overlay is in the tree. Lives in its own hook (rather than the
 * central `useKeyboardShortcuts`) because the arrow-key behavior here
 * intentionally conflicts with the editor's "pan viewport / nudge selection"
 * arrow handling — they're mutually exclusive by construction (presentation
 * mode hides selection chrome and the panning that would compete), and
 * keeping the dedicated bindings in their own hook avoids cross-coupling
 * unrelated editor shortcuts to the presentation flag.
 *
 * Bindings:
 *   ←  previous floor (wraps to last from first)
 *   →  next floor (wraps to first from last)
 *   Home  first floor
 *   End   last floor
 *
 * Bindings are only active while `presentationMode === true` — checked at
 * event time (not at hook-mount time) so the listener stays correct if the
 * mode is toggled off via Escape, the corner button, or the browser
 * exiting fullscreen.
 *
 * Focus guard mirrors `useKeyboardShortcuts`: skip when an INPUT / TEXTAREA
 * / SELECT / contentEditable owns focus, so arrow keys still navigate text
 * inside any floating field that might be reachable in presentation mode.
 *
 * Capture phase keeps the listener ahead of the canvas's own arrow handler,
 * so we get to claim the keystroke before it pans the viewport.
 */
export function usePresentationShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!useUIStore.getState().presentationMode) return

      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) return
      }

      if (
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowRight' &&
        e.key !== 'Home' &&
        e.key !== 'End'
      ) return

      // Floors are stored unordered; the user's mental model is the sorted
      // (by `order`) sequence shown in the FloorSwitcher tabs. Sort once
      // per keystroke — there are at most a handful of floors so the cost
      // is negligible, and we always navigate against the freshest list.
      const { floors, activeFloorId } = useFloorStore.getState()
      if (floors.length === 0) return
      const sorted = [...floors].sort((a, b) => a.order - b.order)
      const currentIndex = sorted.findIndex((f) => f.id === activeFloorId)
      // If the active floor isn't in the sorted list (shouldn't happen,
      // but defensive against a transient mid-load state), bail rather
      // than guess. The user can press the key again after the store
      // settles.
      if (currentIndex === -1) return

      let nextIndex = currentIndex
      if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + sorted.length) % sorted.length
      } else if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % sorted.length
      } else if (e.key === 'Home') {
        nextIndex = 0
      } else if (e.key === 'End') {
        nextIndex = sorted.length - 1
      }

      if (nextIndex === currentIndex) return

      e.preventDefault()
      e.stopPropagation()
      switchToFloor(sorted[nextIndex].id)
    }

    window.addEventListener('keydown', handler, { capture: true })
    return () => {
      window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions)
    }
  }, [])
}
