import { create } from 'zustand'

/**
 * Lightweight flags for *analysis* overlays — read-only visualizations
 * painted on top of the canvas that don't correspond to any `CanvasElement`
 * or category-visibility rule.
 *
 * Today the only member is `equipment` (Feature C6: "does this desk have
 * the equipment its seated employee needs?"). The store exists as its own
 * module rather than living on `uiStore` / `layerVisibilityStore` because:
 *
 *   - `layerVisibilityStore` is category-based (walls / seating / rooms /
 *     …) — each category gates a whole class of elements. An overlay is
 *     not an element class; it's a derived visualization.
 *   - `uiStore` already holds a grab-bag of transient editor state and
 *     accumulates sprawl fast — putting every future overlay flag in
 *     there is how you get a 400-line monolith.
 *
 * Flags default to `false` (hidden). State is in-memory only — an overlay
 * is a transient viewing aid, not a document property, so it resets on
 * reload. If we later decide a particular overlay deserves user-level
 * persistence we can layer Zustand's `persist` middleware onto this store.
 */
export interface OverlaysState {
  /**
   * Equipment-needs overlay: tints each assigned desk by whether the
   * seated employee's needs are met (green / amber / red). See
   * `src/lib/equipmentOverlay.ts` for the status calculation and
   * `src/components/editor/Canvas/EquipmentOverlayLayer.tsx` for the
   * Konva render.
   */
  equipment: boolean

  toggleEquipment: () => void
  setEquipment: (on: boolean) => void
}

export const useOverlaysStore = create<OverlaysState>((set) => ({
  equipment: false,
  toggleEquipment: () => set((s) => ({ equipment: !s.equipment })),
  setEquipment: (on) => set({ equipment: on }),
}))
