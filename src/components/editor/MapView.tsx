import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FloorSwitcher } from './FloorSwitcher'
import { ToolSelector } from './LeftSidebar/ToolSelector'
import { ElementLibrary } from './LeftSidebar/ElementLibrary'
import { RightSidebar } from './RightSidebar/RightSidebar'
import { StatusBar } from './StatusBar'
import { CanvasStage } from './Canvas/CanvasStage'
import { KeyboardShortcutsOverlay } from './KeyboardShortcutsOverlay'
import { Minimap } from './Minimap'
import { useUIStore } from '../../stores/uiStore'
import { useFloorStore } from '../../stores/floorStore'
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
    if (!floorId && !seatId) return

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

    const next = new URLSearchParams(searchParams)
    next.delete('floor')
    next.delete('seat')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        <div className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <ToolSelector />
          <div className="border-t border-gray-200" />
          <ElementLibrary />
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
