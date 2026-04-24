import { create } from 'zustand'

/**
 * Category-based layer visibility.
 *
 * Hiding a category collapses a whole class of elements in one click —
 * "hide all furniture" is a common workflow when planning walls or reviewing
 * circulation paths. Categories are coarser than element types so the UI
 * has a small, stable set of toggles (5 checkboxes) regardless of how many
 * element types we add. See `src/lib/layerCategory.ts` for the
 * element-type → category mapping.
 *
 * The element-level `visible: boolean` flag stays authoritative for
 * individual overrides; renderer / hit-test code should hide an element if
 * EITHER the element is invisible OR its category is hidden. Both axes
 * stack cleanly because they're both "hide" signals — there's no way to
 * force-show an individual element when its category is off, which matches
 * the intuition that a category toggle is the bigger hammer.
 *
 * Defaults: all categories visible on fresh load. State is in-memory only
 * (deliberately not persisted to localStorage) — visibility toggles are a
 * transient viewing aid, not a document property, so they reset with each
 * session. If users later ask for persisted layer state we can layer the
 * `persist` middleware on top without changing the API.
 */
export type LayerCategory =
  | 'walls' // walls + doors + windows (structure)
  | 'seating' // desks + workstations + private offices
  | 'rooms' // meeting rooms + phone booths + kitchens
  | 'furniture' // decor + tables + everything else
  | 'annotations' // text + arrows + shapes + measure

export const LAYER_CATEGORIES: readonly LayerCategory[] = [
  'walls',
  'seating',
  'rooms',
  'furniture',
  'annotations',
] as const

export interface LayerVisibilityState {
  visible: Record<LayerCategory, boolean>
  toggle: (cat: LayerCategory) => void
  show: (cat: LayerCategory) => void
  hide: (cat: LayerCategory) => void
  /**
   * Reset all categories to visible. Exposed primarily for tests and a
   * future "reset layers" UX affordance; keeping it in the store avoids
   * scattering that logic across callers.
   */
  reset: () => void
}

const ALL_VISIBLE: Record<LayerCategory, boolean> = {
  walls: true,
  seating: true,
  rooms: true,
  furniture: true,
  annotations: true,
}

export const useLayerVisibilityStore = create<LayerVisibilityState>((set) => ({
  visible: { ...ALL_VISIBLE },
  toggle: (cat) =>
    set((s) => ({ visible: { ...s.visible, [cat]: !s.visible[cat] } })),
  show: (cat) => set((s) => ({ visible: { ...s.visible, [cat]: true } })),
  hide: (cat) => set((s) => ({ visible: { ...s.visible, [cat]: false } })),
  reset: () => set({ visible: { ...ALL_VISIBLE } }),
}))
