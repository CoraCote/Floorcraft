import { create } from 'zustand'

/**
 * Dedicated store for the canvas cursor position. Split from `canvasStore`
 * on purpose — cursor coordinates update at ~60 fps while the pointer
 * moves, and piggy-backing them onto `canvasStore` would force every
 * subscriber (TopBar, Minimap, CanvasStage, grid renderer, etc.) to
 * re-evaluate their selectors on every frame. Keeping this store isolated
 * means only the small set of components that actually want the coords
 * (currently: the status bar) pays that cost.
 *
 * Coordinates are in world-space canvas units (pre-transform), so they
 * match the units surfaced on element dimensions elsewhere in the UI.
 * `null` means the cursor is outside the canvas — renderers should hide
 * the coordinate readout in that state rather than show a stale value.
 */
interface CursorState {
  x: number | null
  y: number | null
  setCursor: (x: number, y: number) => void
  clearCursor: () => void
}

export const useCursorStore = create<CursorState>((set) => ({
  x: null,
  y: null,
  setCursor: (x, y) => {
    // Skip the `set` when the rounded coords haven't changed — pointers
    // emit lots of same-pixel moves during hover, and bypassing the
    // store update short-circuits the subscriber re-render chain.
    const prev = useCursorStore.getState()
    const rx = Math.round(x)
    const ry = Math.round(y)
    if (prev.x === rx && prev.y === ry) return
    set({ x: rx, y: ry })
  },
  clearCursor: () => {
    const prev = useCursorStore.getState()
    if (prev.x === null && prev.y === null) return
    set({ x: null, y: null })
  },
}))
