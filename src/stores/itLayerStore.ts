import { create } from 'zustand'
import type { ITLayer } from '../types/elements'

/**
 * IT-layer visibility (M2).
 *
 * The M1 wave introduced six new element types (`access-point`,
 * `network-jack`, `display`, `video-bar`, `badge-reader`, `outlet`)
 * routed by `itLayerOf` into four logical sub-layers:
 *
 *   - network    APs + jacks
 *   - av         displays + video bars
 *   - security   badge readers
 *   - power      outlets
 *
 * This store owns one boolean per sub-layer. Hiding a sub-layer collapses
 * every element whose `itLayerOf(el)` matches — implemented in
 * `ElementRenderer` so the canvas filter is a single AND with the existing
 * category-visibility gate. The View-menu toggles in `TopBar` are the
 * primary UI surface; an additional Devices panel (M3) will read the same
 * store to render its filter chips.
 *
 * # Persistence
 *
 * Each sub-layer's state is mirrored into `localStorage` under a stable
 * key (`floocraft.itLayer.{network|av|security|power}`) so the user's
 * choice survives a refresh. Categories the spec explicitly mentioned by
 * name — separate keys per sub-layer rather than a single JSON blob —
 * because:
 *
 *   1. Per-key storage is cheap and matches the existing app idiom (e.g.
 *      `floocraft.elementLibrary.recent`).
 *   2. A future feature can deep-link "open the editor with the security
 *      layer hidden" by writing the one key without touching the others.
 *   3. The cross-tab `storage` event fires per-key, so two tabs editing
 *      different sub-layers don't stomp each other's state.
 *
 * Defaults: all four ON. The spec calls for ON-by-default for every user
 * who has `viewITLayer`; users who don't have the permission never read
 * this store anyway because the canvas gate short-circuits at the
 * permission boundary first.
 */

const KEY_PREFIX = 'floocraft.itLayer.'

const ALL_LAYERS: readonly ITLayer[] = ['network', 'av', 'security', 'power'] as const

function storageKey(layer: ITLayer): string {
  return `${KEY_PREFIX}${layer}`
}

/**
 * Read the persisted boolean for a single sub-layer. We store `'1'` /
 * `'0'` (rather than `'true'` / `'false'`) so the backing key is one byte
 * and easy to skim in a devtools storage inspector. Missing or malformed
 * values default to `true` — first-run users see every layer enabled.
 *
 * Wrapped in try/catch because Safari throws on `localStorage.getItem`
 * inside a private-mode iframe; falling back to `true` keeps the canvas
 * usable even when storage access is denied.
 */
function readPersisted(layer: ITLayer): boolean {
  try {
    const raw = localStorage.getItem(storageKey(layer))
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

function writePersisted(layer: ITLayer, value: boolean): void {
  try {
    localStorage.setItem(storageKey(layer), value ? '1' : '0')
  } catch {
    /* defensive: never block a UI toggle on a failed storage write */
  }
}

export interface ITLayerState {
  /** One boolean per sub-layer. `true` = show elements on this sub-layer. */
  visible: Record<ITLayer, boolean>
  /** Flip a single sub-layer (toggle in the View menu). Persists. */
  toggle: (layer: ITLayer) => void
  /** Force a single sub-layer on. Used by tests + the future "reset"
   *  affordance. Persists. */
  show: (layer: ITLayer) => void
  /** Force a single sub-layer off. Persists. */
  hide: (layer: ITLayer) => void
  /** Reset all four sub-layers back to visible. Used by tests. */
  reset: () => void
}

function initialVisible(): Record<ITLayer, boolean> {
  // Read all four keys at construction. We could have lazily read each on
  // first subscriber but the cost is four `localStorage.getItem` calls —
  // negligible — and an eager read keeps the store's initial render
  // deterministic.
  const result = {} as Record<ITLayer, boolean>
  for (const layer of ALL_LAYERS) {
    result[layer] = readPersisted(layer)
  }
  return result
}

export const useITLayerStore = create<ITLayerState>((set) => ({
  visible: initialVisible(),
  toggle: (layer) =>
    set((s) => {
      const next = !s.visible[layer]
      writePersisted(layer, next)
      return { visible: { ...s.visible, [layer]: next } }
    }),
  show: (layer) =>
    set((s) => {
      writePersisted(layer, true)
      return { visible: { ...s.visible, [layer]: true } }
    }),
  hide: (layer) =>
    set((s) => {
      writePersisted(layer, false)
      return { visible: { ...s.visible, [layer]: false } }
    }),
  reset: () =>
    set(() => {
      for (const layer of ALL_LAYERS) writePersisted(layer, true)
      return { visible: { network: true, av: true, security: true, power: true } }
    }),
}))

/**
 * Stable list of the four sub-layers in their canonical UI ordering. The
 * View-menu reads this so the order matches everywhere we render layer
 * controls (View menu, future Devices panel).
 */
export const IT_LAYERS: readonly ITLayer[] = ALL_LAYERS
