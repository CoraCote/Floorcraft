import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LibraryItem } from '../components/editor/LeftSidebar/ElementLibrary'

const STORAGE_KEY = 'floocraft.library.favorites'

interface FavoritesState {
  /** Serialised as an array by the persist middleware. Runtime API is a
   *  Set for O(1) lookup during render. See below for the migrations. */
  favorites: Set<string>
  toggleFavorite: (item: LibraryItem) => void
  isFavorite: (item: LibraryItem) => boolean
}

export function favoriteKey(item: LibraryItem): string {
  return `${item.type}${item.shape ? `/${item.shape}` : ''}`
}

export const useLibraryFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: new Set<string>(),
      toggleFavorite: (item) =>
        set((state) => {
          const k = favoriteKey(item)
          const next = new Set(state.favorites)
          if (next.has(k)) next.delete(k)
          else next.add(k)
          return { favorites: next }
        }),
      isFavorite: (item) => get().favorites.has(favoriteKey(item)),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Set doesn't JSON-serialise out of the box. Persist as an array and
      // rehydrate back into a Set so the runtime contract stays O(1).
      partialize: (state) => ({
        favorites: Array.from(state.favorites) as unknown as Set<string>,
      }),
      merge: (persisted, current) => {
        const p = persisted as { favorites?: string[] } | undefined
        return {
          ...current,
          favorites: new Set(p?.favorites ?? []),
        }
      },
    },
  ),
)
