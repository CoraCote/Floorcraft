import { create } from 'zustand'
import { temporal } from 'zundo'
import type { Neighborhood } from '../types/neighborhood'
import { UNDO_LIMIT } from '../lib/constants'

interface NeighborhoodState {
  neighborhoods: Record<string, Neighborhood>
  addNeighborhood: (n: Neighborhood) => void
  updateNeighborhood: (id: string, patch: Partial<Neighborhood>) => void
  deleteNeighborhood: (id: string) => void
  clearAll: () => void
  setNeighborhoods: (next: Record<string, Neighborhood>) => void
}

/**
 * Neighborhood store. Wrapped in `temporal` so neighborhood CRUD
 * participates in the global undo/redo stack alongside
 * `elementsStore` — Floocraft's editor shortcut and TopBar buttons
 * trigger both stores' temporal actions so a single Cmd+Z walks back
 * the most recent canvas-visible change regardless of which store it
 * landed in.
 *
 * The `partialize` keeps the temporal-tracked slice lean: we only track
 * the `neighborhoods` map. There's no assignment-like cross-store
 * invariant to strip out (unlike `elementsStore`, which must null out
 * assignment fields before snapshotting), so the partialize is a
 * straight pick.
 */
export const useNeighborhoodStore = create<NeighborhoodState>()(
  temporal(
    (set) => ({
      neighborhoods: {},

      addNeighborhood: (n) =>
        set((state) => ({
          neighborhoods: { ...state.neighborhoods, [n.id]: n },
        })),

      updateNeighborhood: (id, patch) =>
        set((state) => {
          const existing = state.neighborhoods[id]
          if (!existing) return state
          return {
            neighborhoods: {
              ...state.neighborhoods,
              [id]: { ...existing, ...patch },
            },
          }
        }),

      deleteNeighborhood: (id) =>
        set((state) => {
          const rest = { ...state.neighborhoods }
          delete rest[id]
          return { neighborhoods: rest }
        }),

      clearAll: () => set({ neighborhoods: {} }),

      setNeighborhoods: (next) => set({ neighborhoods: next }),
    }),
    {
      limit: UNDO_LIMIT,
      partialize: (state) => ({ neighborhoods: state.neighborhoods }),
    },
  ),
)
