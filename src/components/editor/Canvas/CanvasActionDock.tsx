import { useEffect, useState } from 'react'
import {
  Plus,
  Minus,
  Maximize2,
  LocateFixed,
  Grid3x3,
  Map,
  PlaySquare,
  Maximize,
} from 'lucide-react'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useUIStore } from '../../../stores/uiStore'

/**
 * Floating bottom-right action dock for the canvas, modeled after the
 * JSON Crack control cluster: a translucent vertical pill of icon
 * buttons that consolidates zoom, fit, grid, minimap, presentation, and
 * fullscreen toggles in one place.
 *
 * The dock is intentionally hidden in presentation mode — that mode's
 * existing Exit overlay is the only canvas-affordance we want visible
 * while presenting.
 *
 * Positioned at `bottom-12` to clear the 32px StatusBar (`h-8`,
 * `bottom-0`); `z-20` keeps it above the canvas but below modals and
 * the presentation-mode overlay.
 */
export function CanvasActionDock() {
  const presentationMode = useUIStore((s) => s.presentationMode)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const showGrid = useCanvasStore((s) => s.settings.showGrid)
  const minimapVisible = useUIStore((s) => s.minimapVisible)

  // Track browser fullscreen state so the icon stays in sync if the
  // user exits via Escape (no click on our button).
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false,
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  if (presentationMode) return null

  const onZoomIn = () => useCanvasStore.getState().zoomIn()
  const onZoomOut = () => useCanvasStore.getState().zoomOut()
  const onFit = () => useCanvasStore.getState().zoomToContent()
  const onReset = () => useCanvasStore.getState().resetZoom()
  const onToggleGrid = () => useCanvasStore.getState().toggleGrid()
  const onToggleMinimap = () => useUIStore.getState().toggleMinimap()
  const onPresentation = () => useUIStore.getState().setPresentationMode(true)
  const onFullscreen = () => {
    if (typeof document === 'undefined') return
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void document.documentElement.requestFullscreen?.()
    }
  }

  return (
    <div
      className="absolute bottom-12 right-4 z-20 flex flex-col gap-0.5 p-1 rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur border border-gray-200 dark:border-gray-800 shadow-lg"
      data-testid="canvas-action-dock"
      role="toolbar"
      aria-label="Canvas controls"
    >
      <DockButton
        label="Zoom in"
        title="Zoom in (+ or =)"
        onClick={onZoomIn}
      >
        <Plus className="w-4 h-4" />
      </DockButton>
      <DockButton
        label="Zoom out"
        title="Zoom out (-)"
        onClick={onZoomOut}
      >
        <Minus className="w-4 h-4" />
      </DockButton>
      <div
        className="px-1.5 py-1 text-[10px] font-medium tabular-nums text-gray-500 dark:text-gray-400 text-center select-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {Math.round(stageScale * 100)}%
      </div>

      <DockDivider />

      <DockButton
        label="Fit to content"
        title="Fit to content (1)"
        onClick={onFit}
      >
        <Maximize2 className="w-4 h-4" />
      </DockButton>
      <DockButton
        label="Reset view"
        title="Reset view (0)"
        onClick={onReset}
      >
        <LocateFixed className="w-4 h-4" />
      </DockButton>

      <DockDivider />

      <DockButton
        label="Toggle grid"
        title="Toggle grid (G)"
        onClick={onToggleGrid}
        pressed={showGrid}
      >
        <Grid3x3 className="w-4 h-4" />
      </DockButton>
      <DockButton
        label="Toggle minimap"
        // M is the global Map nav shortcut and Shift+M is the ruler — no
        // free keybind for minimap visibility, so the title omits a hint.
        title="Toggle minimap"
        onClick={onToggleMinimap}
        pressed={minimapVisible}
      >
        <Map className="w-4 h-4" />
      </DockButton>

      <DockDivider />

      <DockButton
        label="Presentation mode"
        title="Presentation mode (P)"
        onClick={onPresentation}
      >
        <PlaySquare className="w-4 h-4" />
      </DockButton>
      <DockButton
        label="Fullscreen"
        title="Fullscreen (F11)"
        onClick={onFullscreen}
        pressed={isFullscreen}
      >
        <Maximize className="w-4 h-4" />
      </DockButton>
    </div>
  )
}

interface DockButtonProps {
  label: string
  title: string
  onClick: () => void
  pressed?: boolean
  children: React.ReactNode
}

function DockButton({ label, title, onClick, pressed, children }: DockButtonProps) {
  const base =
    'w-9 h-9 inline-flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
  const idle =
    'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700'
  const active =
    'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      className={`${base} ${pressed ? active : idle}`}
    >
      {children}
    </button>
  )
}

function DockDivider() {
  return (
    <div
      role="separator"
      className="h-px bg-gray-200 dark:bg-gray-800 mx-1.5 my-0.5"
    />
  )
}
