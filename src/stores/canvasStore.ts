import { create } from 'zustand'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../lib/constants'
import type { CanvasSettings } from '../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'

export type ToolType = 'select' | 'pan' | 'wall' | 'door' | 'window'

interface CanvasState {
  // Viewport
  stageX: number
  stageY: number
  stageScale: number

  // Grid
  settings: CanvasSettings

  // Tool
  activeTool: ToolType

  // Actions
  setStagePosition: (x: number, y: number) => void
  setStageScale: (scale: number) => void
  zoomIn: () => void
  zoomOut: () => void
  zoomToFit: (contentBounds: { x: number; y: number; width: number; height: number }, stageWidth: number, stageHeight: number) => void
  resetZoom: () => void
  setActiveTool: (tool: ToolType) => void
  setSettings: (settings: Partial<CanvasSettings>) => void
  toggleGrid: () => void
  toggleDimensions: () => void
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  stageX: 0,
  stageY: 0,
  stageScale: 1,
  settings: { ...DEFAULT_CANVAS_SETTINGS },
  activeTool: 'select',

  setStagePosition: (x, y) => set({ stageX: x, stageY: y }),

  setStageScale: (scale) =>
    set({ stageScale: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale)) }),

  zoomIn: () => {
    const current = get().stageScale
    set({ stageScale: Math.min(ZOOM_MAX, current + ZOOM_STEP) })
  },

  zoomOut: () => {
    const current = get().stageScale
    set({ stageScale: Math.max(ZOOM_MIN, current - ZOOM_STEP) })
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
