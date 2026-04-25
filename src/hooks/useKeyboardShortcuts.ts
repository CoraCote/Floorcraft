import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useElementsStore } from '../stores/elementsStore'
import { useNeighborhoodStore } from '../stores/neighborhoodStore'
import { useCanvasStore, type ToolType } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'
import { useProjectStore } from '../stores/projectStore'
import { useCanvasFinderStore } from '../stores/canvasFinderStore'
import { useShallow } from 'zustand/react/shallow'
import { deleteElements } from '../lib/seatAssignment'
import { isWallElement } from '../types/elements'

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  // Post Phase 6: editor is mounted exclusively at
  // `/t/:teamSlug/o/:officeSlug/*`.
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  // Pathname drives the map-route gate for Cmd+F (the canvas finder is
  // only meaningful when the floor plan is visible). Other shortcuts
  // either work everywhere inside the project shell or self-gate.
  const { pathname } = useLocation()
  const { selectedIds, clearSelection, setPresentationMode, presentationMode, setShortcutsOverlayOpen } = useUIStore(useShallow((s) => ({ selectedIds: s.selectedIds, clearSelection: s.clearSelection, setPresentationMode: s.setPresentationMode, presentationMode: s.presentationMode, setShortcutsOverlayOpen: s.setShortcutsOverlayOpen })))
  const { duplicateElements, moveElements, groupElements, ungroupElements } = useElementsStore(useShallow((s) => ({ duplicateElements: s.duplicateElements, moveElements: s.moveElements, groupElements: s.groupElements, ungroupElements: s.ungroupElements })))
  const elements = useElementsStore((s) => s.elements)
  const { setActiveTool, toggleGrid, toggleDimensions, toggleNorthArrow, zoomIn, zoomOut, resetZoom } = useCanvasStore(useShallow((s) => ({ setActiveTool: s.setActiveTool, toggleGrid: s.toggleGrid, toggleDimensions: s.toggleDimensions, toggleNorthArrow: s.toggleNorthArrow, zoomIn: s.zoomIn, zoomOut: s.zoomOut, resetZoom: s.resetZoom })))
  // Cmd+Z / Cmd+Shift+Z rewinds every temporal-wrapped store in lock-step
  // so a single undo matches the user's mental model — they just did one
  // thing on the canvas; one keystroke should walk it back regardless of
  // which store (elements vs. neighborhoods) caught the mutation.
  const undo = useCallback(() => {
    useElementsStore.temporal.getState().undo()
    useNeighborhoodStore.temporal.getState().undo()
  }, [])
  const redo = useCallback(() => {
    useElementsStore.temporal.getState().redo()
    useNeighborhoodStore.temporal.getState().redo()
  }, [])

  useEffect(() => {
    // Holds the tool that was active when Space was first pressed, so
    // keyup can restore it. Figma / Miro convention: hold Space to
    // temporarily switch to the pan tool, release to go back to what
    // you were doing. Null when no Space-hold is active. A closure
    // variable (not a ref) because it only needs to survive between
    // the keydown and keyup listeners installed in this same effect.
    let spacePanPrev: ToolType | null = null

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
          // Exit "View as…" impersonation first if it's active — the owner
          // is previewing a lower-privileged UI and expects Escape to drop
          // them back to full permissions before it cancels a drawing or
          // clears a selection. Skipped when a modal is open so Escape
          // still closes the modal (consistent with the modal guard above).
          if (useProjectStore.getState().impersonatedRole !== null) {
            e.preventDefault()
            useProjectStore.getState().setImpersonatedRole(null)
            return
          }
          // Cancel any in-flight canvas drawing session (walls, shapes).
          // Uses an event-bus counter on uiStore so this hook doesn't need
          // to import the drawing hook directly.
          useUIStore.getState().requestCancelDrawing()
          clearSelection()
          setActiveTool('select')
        }
        return
      }

      // Cmd+K / Ctrl+K opens the quick-action palette. Registered BEFORE
      // the modal guard so a previously-open palette can't swallow its
      // own reopen (the palette itself handles reopen by re-focusing the
      // input). `/` is a secondary trigger (GitHub / Linear convention).
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        useUIStore.getState().setCommandPaletteOpen(true)
        return
      }
      if (!mod && e.key === '/' && !modalsOpen) {
        e.preventDefault()
        useUIStore.getState().setCommandPaletteOpen(true)
        return
      }

      // Cmd+F / Ctrl+F → canvas finder. Map route only — on the roster /
      // reports views the native browser find still applies (operators
      // expect to be able to search a long list of names). preventDefault
      // suppresses the browser's built-in find-in-page so the overlay
      // gets the keystroke. The finder owns its own Escape/Enter
      // handlers via the input's keydown, so we only need to open it.
      if (mod && (e.key === 'f' || e.key === 'F')) {
        const onMap = pathname.endsWith('/map') || pathname.includes('/map?') || pathname.includes('/map/')
        if (onMap) {
          e.preventDefault()
          useCanvasFinderStore.getState().openFinder()
          return
        }
      }

      // Everything below this line is a global editor shortcut — skip
      // entirely when a modal is open so Cmd+A, Cmd+Z, arrow nudges, etc.
      // don't leak behind the drawer and mutate the canvas/selection.
      if (modalsOpen) return

      // Space-hold → temporary pan tool. `e.code === 'Space'` rather than
      // `e.key === ' '` so international keyboards still trigger it. Guard
      // on `!e.repeat` so auto-repeat doesn't keep re-saving the previous
      // tool as 'pan' the second keydown onwards, losing the real previous
      // tool. preventDefault stops the browser from page-scrolling the
      // canvas container.
      if (e.code === 'Space' && !e.repeat && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        const current = useCanvasStore.getState().activeTool
        if (current !== 'pan') {
          spacePanPrev = current
          setActiveTool('pan')
        }
        return
      }

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
        e.preventDefault()
        // Empty selection: arrows pan the canvas viewport (Google Maps /
        // Figma convention — ArrowRight moves the view right, revealing
        // more content to the right, which means translating the stage
        // content the opposite direction on screen). Shift accelerates.
        if (selectedIds.length === 0) {
          const step = e.shiftKey ? 80 : 20
          const panX = e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0
          const panY = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0
          const cs = useCanvasStore.getState()
          cs.setStagePosition(cs.stageX + panX, cs.stageY + panY)
          return
        }
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
        // Shift+G activates the neighborhood tool. Must be checked BEFORE
        // the plain-G "toggle grid" branch, otherwise Shift+G would fall
        // through to the grid toggle (Shift+G also matches `e.key === 'G'`).
        if (e.shiftKey && (e.key === 'G' || e.key === 'g')) {
          e.preventDefault()
          setActiveTool('neighborhood'); return
        }
        if (e.key === 'g' || e.key === 'G') { toggleGrid(); return }
        if (e.key === 'd' || e.key === 'D') { toggleDimensions(); return }
        // Plain `N` toggles the floating north-arrow compass. Shift+N
        // (window tool) is checked further down so the modifier-free
        // path here only matches a bare key. `n` is otherwise free —
        // verified against the rest of the editor hotkey table.
        if (!e.shiftKey && (e.key === 'n' || e.key === 'N')) { toggleNorthArrow(); return }
        if (e.key === 'p' || e.key === 'P') { setPresentationMode(!presentationMode); return }
        // Drawing primitives. D and G are already taken (dimensions/grid);
        // R and M are taken on project routes by roster/map nav (handled
        // below), so rect gets Shift+R as an editor-scoped alternative when
        // both params are present. Outside project routes, R is free and
        // activates rect-shape directly.
        if (e.shiftKey && (e.key === 'R' || e.key === 'r')) {
          e.preventDefault()
          setActiveTool('rect-shape'); return
        }
        // Shift+D and Shift+N for door/window. Plain D is already
        // "toggle dimensions" and plain W is "wall"; Shift-locking these
        // keeps them out of the modifier-free hotkey pool while still
        // being discoverable from the tool-selector label.
        if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
          e.preventDefault()
          setActiveTool('door'); return
        }
        if (e.shiftKey && (e.key === 'N' || e.key === 'n')) {
          e.preventDefault()
          setActiveTool('window'); return
        }
        // Shift+M activates the ruler. Plain M is already "jump to Map
        // view" on project routes, so shift-lock mirrors the door/window
        // Shift+D / Shift+N pattern.
        if (e.shiftKey && (e.key === 'M' || e.key === 'm')) {
          e.preventDefault()
          setActiveTool('measure'); return
        }
        if (!e.shiftKey && (e.key === 'r' || e.key === 'R') && !(teamSlug && officeSlug)) {
          setActiveTool('rect-shape'); return
        }
        if (e.key === 'e' || e.key === 'E') { setActiveTool('ellipse'); return }
        if (e.key === 'l' || e.key === 'L') { setActiveTool('line-shape'); return }
        if (e.key === 'a' || e.key === 'A') { setActiveTool('arrow'); return }
        if (e.key === 't' || e.key === 'T') { setActiveTool('free-text'); return }
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
        // O → Org chart. Mirrors the M / R jump-keys so HR users don't
        // have to leave the keyboard when triaging reporting data.
        if ((e.key === 'o' || e.key === 'O') && teamSlug && officeSlug) {
          e.preventDefault()
          navigate(`/t/${teamSlug}/o/${officeSlug}/org-chart`)
          return
        }
      }
    }

    // Release Space → restore whatever tool was active before the hold.
    // Skipped when typing (focus guard mirrors keydown) so a space typed
    // into an input doesn't accidentally flip the tool on keyup if the
    // key transitioned focus mid-press.
    const keyupHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (spacePanPrev === null) return
      const t = e.target as HTMLElement
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable
      ) return
      setActiveTool(spacePanPrev)
      spacePanPrev = null
    }

    // Alt-Tab / window-switch while holding Space would otherwise leave
    // the user stuck in pan mode — we never see the keyup. Restore on
    // blur for the same reason.
    const blurHandler = () => {
      if (spacePanPrev !== null) {
        setActiveTool(spacePanPrev)
        spacePanPrev = null
      }
    }

    // Capture phase: runs BEFORE modal/dialog bubble-phase listeners, so
    // Escape reliably exits presentation mode even if a modal happens to be
    // open when presentation mode is toggled.
    window.addEventListener('keydown', handler, { capture: true })
    window.addEventListener('keyup', keyupHandler, { capture: true })
    window.addEventListener('blur', blurHandler)
    return () => {
      window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions)
      window.removeEventListener('keyup', keyupHandler, { capture: true } as EventListenerOptions)
      window.removeEventListener('blur', blurHandler)
    }
  }, [
    selectedIds, elements, presentationMode,
    clearSelection, duplicateElements, moveElements,
    groupElements, ungroupElements, setActiveTool, toggleGrid, toggleDimensions, toggleNorthArrow,
    zoomIn, zoomOut, resetZoom, setPresentationMode, setShortcutsOverlayOpen,
    undo, redo, navigate, teamSlug, officeSlug, pathname,
  ])
}
