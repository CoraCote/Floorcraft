import { create } from 'zustand'

/**
 * The canvas finder ("Cmd+F on the floor plan") is a JSON Crack-inspired
 * overlay that searches inside the active floor — desks, conference rooms,
 * common areas, neighborhoods, employees — and lets the user cycle through
 * matches with Enter / Shift+Enter while every other element is dimmed on
 * the canvas.
 *
 * This store holds only the in-memory presentation state: open/closed,
 * the user's query, the current match list, and the active match index.
 * Match detection itself is computed by `useCanvasFinder` from store
 * snapshots; we deliberately keep the store DOM-free so it can be
 * exercised by unit tests with no React needed.
 */

/**
 * Discriminated union of finder match kinds. The `anchorId` is always an
 * element id on the active floor — for an `employee` match, it's the
 * employee's seat (so highlight + focus have a Konva node to land on);
 * for `element` and `neighborhood` it's the element/neighborhood id
 * itself. Keeping the kind tag lets the renderer/finder UI surface
 * different chips per match type later without re-deriving it.
 */
export interface FinderMatch {
  kind: 'element' | 'neighborhood' | 'employee'
  /** Stable identifier for the matched record (employee id, element id, neighborhood id). */
  id: string
  /** Element id to highlight + focus on. For employees this is `seatId`. */
  anchorId: string
  /** Display label shown in match-cycle telemetry / future result list. */
  label: string
}

interface CanvasFinderState {
  open: boolean
  query: string
  matches: FinderMatch[]
  activeIndex: number

  openFinder: () => void
  closeFinder: () => void
  setQuery: (q: string) => void
  setMatches: (matches: FinderMatch[]) => void
  next: () => void
  prev: () => void
  /** Reset to initial state — used on floor change / route change. */
  reset: () => void
}

export const useCanvasFinderStore = create<CanvasFinderState>()((set) => ({
  open: false,
  query: '',
  matches: [],
  activeIndex: 0,

  openFinder: () => set({ open: true }),

  closeFinder: () =>
    set({ open: false, query: '', matches: [], activeIndex: 0 }),

  setQuery: (q) => set({ query: q }),

  setMatches: (matches) =>
    set((s) => ({
      matches,
      // Clamp the active index to the new range. When the new list is
      // empty we reset to 0 (rather than -1) so callers can index
      // unconditionally and just guard on `matches.length`.
      activeIndex:
        matches.length === 0
          ? 0
          : s.activeIndex >= matches.length
            ? 0
            : s.activeIndex,
    })),

  next: () =>
    set((s) => {
      if (s.matches.length === 0) return s
      return { activeIndex: (s.activeIndex + 1) % s.matches.length }
    }),

  prev: () =>
    set((s) => {
      if (s.matches.length === 0) return s
      return {
        activeIndex:
          (s.activeIndex - 1 + s.matches.length) % s.matches.length,
      }
    }),

  reset: () => set({ open: false, query: '', matches: [], activeIndex: 0 }),
}))
