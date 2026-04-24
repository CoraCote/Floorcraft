import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FloorSwitcher } from './FloorSwitcher'
import { ToolSelector } from './LeftSidebar/ToolSelector'
import { LayerVisibilityPanel } from './LeftSidebar/LayerVisibilityPanel'
import { ElementLibrary } from './LeftSidebar/ElementLibrary'
import { CollapsibleSection } from './LeftSidebar/CollapsibleSection'
import { RightSidebar } from './RightSidebar/RightSidebar'
import { StatusBar } from './StatusBar'
import { CanvasStage } from './Canvas/CanvasStage'
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay'
import { Minimap } from './Minimap'
import { useUIStore } from '../../stores/uiStore'
import { useFloorStore } from '../../stores/floorStore'
import { useNeighborhoodStore } from '../../stores/neighborhoodStore'
import { useToastStore } from '../../stores/toastStore'
import { switchToFloor } from '../../lib/seatAssignment'
import { focusOnElement } from '../../lib/canvasFocus'

/**
 * Map (canvas) view. Rendered inside `ProjectShell`'s `<Outlet />`, so the
 * TopBar, global modals, and project bootstrap all live in the shell.
 *
 * Presentation mode is intentionally handled here rather than in the shell:
 * it's a map-only concept (no canvas on the roster page), and rendering it
 * as a `fixed inset-0 z-50` overlay lets it cover the parent TopBar without
 * requiring the shell to know anything about it.
 */
export function MapView() {
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const presentationMode = useUIStore((s) => s.presentationMode)
  const [searchParams, setSearchParams] = useSearchParams()

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

  if (presentationMode) {
    return (
      <div className="fixed inset-0 z-50 w-screen h-screen bg-white">
        <CanvasStage />
        <KeyboardShortcutsOverlay />
        {/* Always-visible exit affordance — Escape/P alone is undiscoverable */}
        <button
          onClick={() => useUIStore.getState().setPresentationMode(false)}
          className="absolute top-4 right-4 z-50 px-3 py-2 rounded-md bg-gray-900/80 hover:bg-gray-900 text-white text-sm font-medium shadow-lg backdrop-blur-sm flex items-center gap-2 transition-colors"
          title="Exit presentation mode (Esc or P)"
          aria-label="Exit presentation mode"
        >
          <span>Exit</span>
          <kbd className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded">Esc</kbd>
        </button>
      </div>
    )
  }

  return (
    <>
      <FloorSwitcher />
      <div className="flex flex-1 overflow-hidden">
        {/*
          The sidebar scrolls as a single unit. ToolSelector +
          LayerVisibilityPanel + ElementLibrary stack at their natural
          heights and the whole column owns the scrollbar — so when the
          top panels grow (filters open, more layers, etc.) they can't
          squeeze ElementLibrary's tiles off the bottom. Previously the
          library owned its own `overflow-y-auto` inside a `min-h-0`
          column, which clipped tiles when its siblings took more space.
        */}
        <div className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <CollapsibleSection title="Tools" defaultOpen storageKey="tools">
            <ToolSelector />
          </CollapsibleSection>
          <CollapsibleSection title="Layers" defaultOpen storageKey="layers">
            <LayerVisibilityPanel />
          </CollapsibleSection>
          <CollapsibleSection title="Library" defaultOpen storageKey="library">
            <ElementLibrary />
          </CollapsibleSection>
        </div>
        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          <CanvasStage />
          <StatusBar />
          <Minimap />
        </div>
        {rightSidebarOpen && (
          <div className="w-[320px] flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
            <RightSidebar />
          </div>
        )}
      </div>
    </>
  )
}
