import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EditorDesktopGate } from './EditorDesktopGate'
import { useViewportNarrow, BREAKPOINT } from '../../hooks/useViewportNarrow'
import { FloorSwitcher } from './FloorSwitcher'
import { ToolSelector } from './LeftSidebar/ToolSelector'
import { LayerVisibilityPanel } from './LeftSidebar/LayerVisibilityPanel'
import { ElementLibrary } from './LeftSidebar/ElementLibrary'
import { CollapsibleSection } from './LeftSidebar/CollapsibleSection'
import { RightSidebar } from './RightSidebar/RightSidebar'
import { SidebarToggle } from './RightSidebar/SidebarToggle'
import { StatusBar } from './StatusBar'
import { CanvasStage } from './Canvas/CanvasStage'
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay'
import { PresentationOverlay } from './PresentationOverlay'
import { Minimap } from './Minimap'
import { CanvasActionDock } from './Canvas/CanvasActionDock'
import { CanvasScaleBar } from './Canvas/CanvasScaleBar'
import { NorthArrow } from './Canvas/NorthArrow'
import { AlignDistributeToolbar } from './Canvas/AlignDistributeToolbar'
import { ElementHoverCard } from './Canvas/ElementHoverCard'
import { FirstRunCoach } from './FirstRunCoach'
import { SampleOfficeCallout } from './SampleOfficeCallout'
import { PdfPagePickerDialog } from './PdfPagePickerDialog'
import { useUIStore } from '../../stores/uiStore'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useCanvasStore } from '../../stores/canvasStore'
import { useFloorStore } from '../../stores/floorStore'
import { useNeighborhoodStore } from '../../stores/neighborhoodStore'
import { useToastStore } from '../../stores/toastStore'
import { switchToFloor } from '../../lib/seatAssignment'
import { focusOnElement } from '../../lib/canvasFocus'

/**
 * Map (canvas) view. Rendered inside `ProjectShell`'s `<Outlet />`, so the
 * TopBar, global modals, and project bootstrap all live in the shell.
 *
 * The Cmd+K / Ctrl+K command palette (`CommandPalette.tsx` +
 * `commandPaletteActions.ts`) is mounted at the shell level so it's
 * reachable from every office route, not just the map. The shortcut is
 * wired in `useKeyboardShortcuts` — MapView itself consumes the palette's
 * outputs indirectly via `switchToFloor` + `focusOnElement`, which the
 * palette's floor/find-seat/find-element actions dispatch to.
 *
 * Presentation mode is intentionally handled here rather than in the shell:
 * it's a map-only concept (no canvas on the roster page), and rendering it
 * as a `fixed inset-0 z-50` overlay lets it cover the parent TopBar without
 * requiring the shell to know anything about it.
 */
export function MapView() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen)
  const setLeftSidebarOpen = useUIStore((s) => s.setLeftSidebarOpen)
  const presentationMode = useUIStore((s) => s.presentationMode)
  // The north-arrow compass renders by default but the user can hide
  // it via View → "Toggle compass" or the `N` hotkey when the floor
  // plan has no real-world cardinal alignment. Legacy projects (no
  // field set) keep the historical behaviour by treating undefined
  // as `true`.
  const showNorthArrow = useCanvasStore((s) => s.settings.showNorthArrow ?? true)
  const [searchParams, setSearchParams] = useSearchParams()
  // Hard desktop gate. Below `lg` (1024 px) the sidebars + canvas
  // can't coexist in any usable way — see EditorDesktopGate for the
  // multi-paragraph rationale. We keep presentation mode (hosted
  // at the same route) untouched: presenters might cast from a phone
  // and shouldn't lose their slides.
  // Wave 21 hard-gate threshold relaxed: 1024 (lg) → 768 (md). The
  // previous lg-cutoff blocked iPad portrait (768/810 px), Surface
  // portrait, and most Android tablets — devices where read-only
  // viewing of a finished plan (walk-throughs, all-hands,
  // on-floor wayfinding) is genuinely useful. Below 768 the layout
  // truly breaks (sidebar widths exceed canvas width even with both
  // collapsed), so the gate stays for phones; tablet operators get
  // the full editor and can collapse the side panels via the existing
  // chevrons in PR #177.
  const isNarrow = useViewportNarrow(BREAKPOINT.md)

  useEffect(() => {
    const floorId = searchParams.get('floor')
    const seatId = searchParams.get('seat')
    const focusId = searchParams.get('focus')
    if (!floorId && !seatId && !focusId) return

    if (floorId) {
      switchToFloor(floorId)
    }

    if (seatId) {
      const floors = useFloorStore.getState().floors
      const target = floors.find(
        (f) => f.id === (floorId ?? useFloorStore.getState().activeFloorId),
      )
      const element = target?.elements[seatId]
      if (element) {
        useUIStore.getState().setSelectedIds([seatId])
        focusOnElement(
          { x: element.x, y: element.y, width: element.width, height: element.height },
          seatId,
        )
      }
    }

    // `?focus=<id>` — cross-office search landing. Walk every floor for
    // an element or a neighborhood with this id; whichever hits first
    // wins. We switch to the owning floor and pan/zoom to it so the
    // operator doesn't have to hunt. Done in a single effect after the
    // store-hydration in ProjectShell has completed (the palette
    // navigates to this route, and by the time the effect fires the
    // stores have rehydrated the destination office).
    if (focusId) {
      const floors = useFloorStore.getState().floors
      let foundOn: string | null = null
      let bounds: { x: number; y: number; width: number; height: number } | null = null
      for (const f of floors) {
        const el = f.elements[focusId]
        if (el) {
          foundOn = f.id
          bounds = { x: el.x, y: el.y, width: el.width, height: el.height }
          break
        }
      }
      if (!bounds) {
        const neighborhoods = useNeighborhoodStore.getState().neighborhoods
        const n = neighborhoods[focusId]
        if (n) {
          foundOn = n.floorId
          bounds = { x: n.x, y: n.y, width: n.width, height: n.height }
        }
      }
      if (foundOn && bounds) {
        switchToFloor(foundOn)
        useUIStore.getState().setSelectedIds([focusId])
        focusOnElement(bounds, focusId)
      }
    }

    const next = new URLSearchParams(searchParams)
    next.delete('floor')
    next.delete('seat')
    next.delete('focus')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // First-run onboarding toast for presentation mode: the Esc/P exit
  // shortcut isn't documented in the mode itself beyond the small
  // "Exit" button, so surface it once per device the first time the
  // operator enters presentation. Localstorage key gates subsequent
  // entries; wrapped in try/catch so a private-mode / disabled-storage
  // browser just skips the hint rather than crashing.
  useEffect(() => {
    if (!presentationMode) return
    try {
      if (localStorage.getItem('presentationModeHintSeen') === '1') return
      localStorage.setItem('presentationModeHintSeen', '1')
    } catch {
      return
    }
    useToastStore.getState().push({
      tone: 'info',
      title: 'Press Esc or P to exit presentation mode.',
    })
  }, [presentationMode])

  // Render the desktop-only gate FIRST, before the regular map shell —
  // but always after the presentation-mode branch so a phone-cast
  // scenario still works. Other MapView states (signed-out / not-found)
  // are owned by ProjectShell, so we don't have to mirror them here.
  if (!presentationMode && isNarrow) {
    return <EditorDesktopGate />
  }

  if (presentationMode) {
    return (
      <div className="fixed inset-0 z-50 w-screen h-screen bg-[color:var(--color-paper-raised)] dark:bg-gray-900">
        <CanvasStage />
        <KeyboardShortcutsOverlay />
        <PresentationOverlay />
        {/* Tool rail also rendered in presentation mode so a presenter
            who needs to make a quick edit doesn't have to exit the
            view first. Floating left, narrow column, same widget the
            standard editor uses. */}
        <div className="absolute left-0 top-0 bottom-0 z-50 w-14 bg-[color:var(--color-paper-raised)]/95 dark:bg-gray-900/95 border-r border-[color:var(--color-paper-line)] dark:border-gray-800 backdrop-blur-sm flex flex-col overflow-y-auto">
          <ToolSelector />
        </div>
        {/* Always-visible exit affordance — Escape/P alone is undiscoverable */}
        <button
          onClick={() => useUIStore.getState().setPresentationMode(false)}
          className="absolute top-4 right-4 z-50 px-3 py-2 rounded-md bg-gray-900/80 hover:bg-gray-900 text-white text-sm font-medium shadow-lg backdrop-blur-sm flex items-center gap-2 transition-colors"
          title="Exit presentation mode (Esc or P)"
          aria-label="Exit presentation mode"
        >
          <span>Exit</span>
          <kbd className="text-[10px] font-mono bg-white/20 dark:bg-gray-900/20 px-1.5 py-0.5 rounded">Esc</kbd>
        </button>
      </div>
    )
  }

  return (
    <>
      <FloorSwitcher />
      <div className="flex flex-1 overflow-hidden">
        {/*
          Restored single-sidebar layout: tools sit ABOVE Layers + Library
          in one 260-px column. The pre-Wave 21A pattern. The icon-only
          tool rail experiment was reverted because experienced operators
          couldn't quickly distinguish glyphs without labels.

          When collapsed, a slim toggle pull-tab on the canvas's left
          edge re-opens it; keyboard shortcuts (V, W, R, etc.) keep all
          tools reachable while the sidebar is closed.
        */}
        {leftSidebarOpen ? (
          <div className="w-[260px] flex-shrink-0 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 border-r border-[color:var(--color-paper-line)] dark:border-gray-800 flex flex-col overflow-y-auto">
            <CollapsibleSection title="Tools" defaultOpen storageKey="tools">
              <ToolSelector />
            </CollapsibleSection>
            <CollapsibleSection title="Layers" defaultOpen storageKey="layers">
              <LayerVisibilityPanel />
            </CollapsibleSection>
            <CollapsibleSection title="Library" defaultOpen storageKey="library">
              <ElementLibrary />
            </CollapsibleSection>
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(false)}
              aria-label="Collapse left sidebar"
              title="Collapse panel"
              className="mt-auto mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded text-gray-500 hover:bg-[color:var(--color-paper-sunken)] hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              <ChevronsLeft size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLeftSidebarOpen(true)}
            aria-label="Expand left sidebar"
            title="Expand panel"
            className="self-start mt-3 ml-1 flex h-8 w-8 items-center justify-center rounded bg-[color:var(--color-paper-raised)] dark:bg-gray-900 border border-[color:var(--color-paper-line)] dark:border-gray-800 text-gray-500 hover:bg-[color:var(--color-paper-sunken)] hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors shadow-sm z-10"
          >
            <ChevronsRight size={16} aria-hidden="true" />
          </button>
        )}
        <div className="flex-1 relative bg-[color:var(--color-paper)] overflow-hidden">
          <CanvasStage />
          <StatusBar />
          <Minimap />
          <AlignDistributeToolbar />
          <ElementHoverCard />
          <CanvasActionDock />
          <CanvasScaleBar />
          {showNorthArrow && <NorthArrow />}
          <FirstRunCoach />
          <SampleOfficeCallout />
          <PdfPagePickerDialog />
          {/* Closed-state pull-tab to expand the right sidebar.
              Replaces the toggle that used to live in the TopBar so
              the control belongs to the panel it controls. Only
              renders when the panel is hidden. */}
          {!rightSidebarOpen && <SidebarToggle variant="floating" />}
        </div>
        {rightSidebarOpen && (
          <div className="w-[320px] flex-shrink-0 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 border-l border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-y-auto">
            <RightSidebar />
          </div>
        )}
      </div>
    </>
  )
}
