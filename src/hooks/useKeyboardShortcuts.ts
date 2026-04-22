import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useElementsStore } from '../stores/elementsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { deleteElements } from '../lib/seatAssignment'
import { isWallElement } from '../types/elements'

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  // Post Phase 6: editor is mounted exclusively at
  // `/t/:teamSlug/o/:officeSlug/*`.
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const { selectedIds, clearSelection, setPresentationMode, presentationMode, setShortcutsOverlayOpen } = useUIStore(useShallow((s) => ({ selectedIds: s.selectedIds, clearSelection: s.clearSelection, setPresentationMode: s.setPresentationMode, presentationMode: s.presentationMode, setShortcutsOverlayOpen: s.setShortcutsOverlayOpen })))
  const { duplicateElements, moveElements, groupElements, ungroupElements } = useElementsStore(useShallow((s) => ({ duplicateElements: s.duplicateElements, moveElements: s.moveElements, groupElements: s.groupElements, ungroupElements: s.ungroupElements })))
  const elements = useElementsStore((s) => s.elements)
  const { setActiveTool, toggleGrid, toggleDimensions, zoomIn, zoomOut, resetZoom } = useCanvasStore(useShallow((s) => ({ setActiveTool: s.setActiveTool, toggleGrid: s.toggleGrid, toggleDimensions: s.toggleDimensions, zoomIn: s.zoomIn, zoomOut: s.zoomOut, resetZoom: s.resetZoom })))
  const undo = useElementsStore.temporal.getState().undo
  const redo = useElementsStore.temporal.getState().redo

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Focus guard: don't hijack typing. SELECT is included because its
      // native keyboard handling (Enter to open, letters to jump-select)
      // would otherwise be eaten by our hotkeys.
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return

      // Modal guard: while a drawer/dialog owns focus, global shortcuts
      // stand down so Escape closes the modal (not the canvas selection)
      // and tool hotkeys don't flip behind the user's back. Presentation
      // mode is the one global state exempt from this — Escape MUST always
      // be able to exit it regardless of what's on top.
      const modalsOpen = useUIStore.getState().modalOpenCount > 0

      const mod = e.metaKey || e.ctrlKey

      if (e.key === 'Escape') {
        if (presentationMode) {
          // In presentation mode, Escape MUST exit. Prevent the browser
          // default (which in some browsers exits native fullscreen without
          // clearing our state) and stop other listeners from competing.
          e.preventDefault()
          e.stopImmediatePropagation()
          setPresentationMode(false)
        } else if (!modalsOpen) {
          // Cancel any in-flight canvas drawing session (walls, shapes).
          // Uses an event-bus counter on uiStore so this hook doesn't need
          // to import the drawing hook directly.
          useUIStore.getState().requestCancelDrawing()
          clearSelection()
          setActiveTool('select')
        }
        return
      }

      // Everything below this line is a global editor shortcut — skip
      // entirely when a modal is open so Cmd+A, Cmd+Z, arrow nudges, etc.
      // don't leak behind the drawer and mutate the canvas/selection.
      if (modalsOpen) return

      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return }
      if (mod && e.key === 'Z') { e.preventDefault(); redo(); return }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        deleteElements(selectedIds)
        clearSelection()
        return
      }

      if (mod && e.key === 'd') {
        e.preventDefault()
        if (selectedIds.length > 0) {
          const newIds = duplicateElements(selectedIds)
          useUIStore.getState().setSelectedIds(newIds)
        }
        return
      }

      if (mod && e.key === 'a') {
        e.preventDefault()
        useUIStore.getState().setSelectedIds(Object.keys(elements))
        return
      }

      if (mod && e.key === 'g' && !e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length > 1) groupElements(selectedIds)
        return
      }

      if (mod && e.key === 'g' && e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length === 1) {
          const el = elements[selectedIds[0]]
          if (el?.groupId) ungroupElements(el.groupId)
        }
        return
      }

      if (mod && e.key === 'l') {
        e.preventDefault()
        for (const id of selectedIds) {
          const el = elements[id]
          if (el) useElementsStore.getState().updateElement(id, { locked: !el.locked })
        }
        return
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (selectedIds.length === 0) return
        e.preventDefault()
        const amount = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -amount : e.key === 'ArrowRight' ? amount : 0
        const dy = e.key === 'ArrowUp' ? -amount : e.key === 'ArrowDown' ? amount : 0

        // Walls are rendered at (0, 0) with geometry baked into `points`, so
        // nudging x/y has no visible effect. Shift each point instead.
        const nonWallIds: string[] = []
        const updateElement = useElementsStore.getState().updateElement
        for (const id of selectedIds) {
          const el = elements[id]
          if (!el || el.locked) continue
          if (isWallElement(el)) {
            const shifted: number[] = new Array(el.points.length)
            for (let i = 0; i < el.points.length; i += 2) {
              shifted[i] = el.points[i] + dx
              shifted[i + 1] = el.points[i + 1] + dy
            }
            updateElement(id, { points: shifted, x: 0, y: 0 })
          } else {
            nonWallIds.push(id)
          }
        }
        if (nonWallIds.length > 0) moveElements(nonWallIds, dx, dy)
        return
      }

      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return }
      if (mod && e.key === '-') { e.preventDefault(); zoomOut(); return }
      if (mod && e.key === '0') { e.preventDefault(); resetZoom(); return }

      if (!mod) {
        if (e.key === 'v' || e.key === 'V') { setActiveTool('select'); return }
        if (e.key === 'w' || e.key === 'W') { setActiveTool('wall'); return }
        if (e.key === 'g' || e.key === 'G') { toggleGrid(); return }
        if (e.key === 'd' || e.key === 'D') { toggleDimensions(); return }
        if (e.key === 'p' || e.key === 'P') { setPresentationMode(!presentationMode); return }
        if (e.key === '?') { setShortcutsOverlayOpen(true); return }
        // M / R jump between the MAP and ROSTER views of the current
        // office. Guarded on both params so the hotkeys are inert outside
        // the project shell (and `navigate` is safe to call — we're
        // inside the Router).
        if ((e.key === 'm' || e.key === 'M') && teamSlug && officeSlug) {
          e.preventDefault()
          navigate(`/t/${teamSlug}/o/${officeSlug}/map`)
          return
        }
        if ((e.key === 'r' || e.key === 'R') && teamSlug && officeSlug) {
          e.preventDefault()
          navigate(`/t/${teamSlug}/o/${officeSlug}/roster`)
          return
        }
      }
    }

    // Capture phase: runs BEFORE modal/dialog bubble-phase listeners, so
    // Escape reliably exits presentation mode even if a modal happens to be
    // open when presentation mode is toggled.
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions)
  }, [
    selectedIds, elements, presentationMode,
    clearSelection, duplicateElements, moveElements,
    groupElements, ungroupElements, setActiveTool, toggleGrid, toggleDimensions,
    zoomIn, zoomOut, resetZoom, setPresentationMode, setShortcutsOverlayOpen,
    undo, redo, navigate, teamSlug, officeSlug,
  ])
}
