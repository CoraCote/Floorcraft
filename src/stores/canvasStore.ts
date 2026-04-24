import { create } from 'zustand'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR } from '../lib/constants'
import type { CanvasSettings } from '../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'

export type ToolType =
  | 'select'
  | 'pan'
  | 'wall'
  | 'door'
  | 'window'
  // Drawing primitives (Feature A)
  | 'rect-shape'
  | 'ellipse'
  | 'line-shape'
  | 'arrow'
  | 'free-text'
  // Measurement tools. `measure` is a polyline-style ruler: click to add
  // vertices, double-click or Enter to finish. The running total is shown
  // live; the final polyline is a persistent overlay until dismissed.
  | 'measure'
  // Neighborhood tool. Click-drag on empty canvas to paint a labeled
  // zone; click an existing neighborhood to select it for resize/rename.
  | 'neighborhood'

export type WallDrawStyle = 'solid' | 'dashed' | 'dotted'

interface CanvasState {
  // Viewport
  stageX: number
  stageY: number
  stageScale: number

  // Live canvas container size (px). Published from CanvasStage's
  // ResizeObserver so anything outside the stage (minimap viewport
  // indicator, zoom-to-fit, keyboard shortcuts) can reason about the
  // drawable area without measuring the DOM itself. Starts at 0×0 so a
  // consumer reading before the observer fires can fall back gracefully.
  stageWidth: number
  stageHeight: number

  // Grid
  settings: CanvasSettings

  // Tool
  activeTool: ToolType

  // Wall drawing style preset (Feature D). Applied to new walls committed
  // from the wall tool. Persists across tool switches so "draw a few dashed
  // walls, then switch to select to tweak, then back to wall" doesn't
  // silently forget the preset.
  wallDrawStyle: WallDrawStyle

  // Actions
  setStagePosition: (x: number, y: number) => void
  setStageScale: (scale: number) => void
  setStageSize: (width: number, height: number) => void
  zoomIn: () => void
  zoomOut: () => void
  zoomToFit: (contentBounds: { x: number; y: number; width: number; height: number }, stageWidth: number, stageHeight: number) => void
  resetZoom: () => void
  setActiveTool: (tool: ToolType) => void
  setWallDrawStyle: (style: WallDrawStyle) => void
  setSettings: (settings: Partial<CanvasSettings>) => void
  toggleGrid: () => void
  toggleDimensions: () => void
}

/**
 * Compute the stage offset that keeps the centre of the visible canvas
 * fixed as the scale changes. Returns the same stageX/stageY pair the
 * wheel-zoom handler would produce if the pointer were at the canvas
 * centre. Falls back to no translation when the size hasn't been
 * published yet (cold mount before the ResizeObserver fires).
 */
function anchorZoom(
  oldScale: number,
  newScale: number,
  stageX: number,
  stageY: number,
  stageWidth: number,
  stageHeight: number,
) {
  if (stageWidth <= 0 || stageHeight <= 0) {
    return { stageScale: newScale }
  }
  const cx = stageWidth / 2
  const cy = stageHeight / 2
  const worldX = (cx - stageX) / oldScale
  const worldY = (cy - stageY) / oldScale
  return {
    stageScale: newScale,
    stageX: cx - worldX * newScale,
    stageY: cy - worldY * newScale,
  }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  stageX: 0,
  stageY: 0,
  stageScale: 1,
  stageWidth: 0,
  stageHeight: 0,
  settings: { ...DEFAULT_CANVAS_SETTINGS },
  activeTool: 'select',
  wallDrawStyle: 'solid',

  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),

  setStageScale: (scale) =>
    set({ stageScale: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale)) }),

  setStageSize: (width, height) => {
    // Skip writes when the measurement hasn't actually changed — a
    // ResizeObserver fires on layout re-flows even when dimensions are
    // stable, and Zustand would otherwise notify subscribers every time.
    const prev = get()
    if (prev.stageWidth === width && prev.stageHeight === height) return
    set({ stageWidth: width, stageHeight: height })
  },

  // Toolbar / keyboard zoom. Multiplicative so the perceived step stays
  // uniform: a +0.1 additive jump at 10% zoom was a doubling, while at
  // 400% it was barely visible. We also re-anchor the viewport on the
  // canvas midpoint so the content that was centred stays centred —
  // without that, zooming from the toolbar visibly drifts toward (0, 0).
  zoomIn: () => {
    const { stageScale, stageX, stageY, stageWidth, stageHeight } = get()
    const newScale = Math.min(ZOOM_MAX, stageScale * ZOOM_FACTOR)
    if (newScale === stageScale) return
    set(anchorZoom(stageScale, newScale, stageX, stageY, stageWidth, stageHeight))
  },

  zoomOut: () => {
    const { stageScale, stageX, stageY, stageWidth, stageHeight } = get()
    const newScale = Math.max(ZOOM_MIN, stageScale / ZOOM_FACTOR)
    if (newScale === stageScale) return
    set(anchorZoom(stageScale, newScale, stageX, stageY, stageWidth, stageHeight))
  },

  zoomToFit: (contentBounds, stageWidth, stageHeight) => {
    if (contentBounds.width === 0 || contentBounds.height === 0) return
    const padding = 50
    const scaleX = (stageWidth - padding * 2) / contentBounds.width
    const scaleY = (stageHeight - padding * 2) / contentBounds.height
    const newScale = Math.min(scaleX, scaleY, ZOOM_MAX)
    const newX = -contentBounds.x * newScale + (stageWidth - contentBounds.width * newScale) / 2
    const newY = -contentBounds.y * newScale + (stageHeight - contentBounds.height * newScale) / 2
    set({ stageScale: newScale, stageX: newX, stageY: newY })
  },

  resetZoom: () => set({ stageScale: 1, stageX: 0, stageY: 0 }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setWallDrawStyle: (style) => set({ wallDrawStyle: style }),

  setSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),

  toggleGrid: () =>
    set((state) => ({
      settings: { ...state.settings, showGrid: !state.settings.showGrid },
    })),

  toggleDimensions: () =>
    set((state) => ({
      settings: { ...state.settings, showDimensions: !state.settings.showDimensions },
    })),
}))
