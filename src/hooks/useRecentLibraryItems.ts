import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { LibraryItem } from '../components/editor/LeftSidebar/ElementLibrary'

const MAX_RECENTS = 6
const STORAGE_KEY = 'floocraft.library.recents'

interface RecentsState {
  recents: LibraryItem[]
  addRecent: (item: LibraryItem) => void
  clear: () => void
}

/** Stable identity key for an item. Same item type+shape dedupes. */
function itemKey(item: LibraryItem): string {
  return `${item.type}${item.shape ? `/${item.shape}` : ''}`
}

export const useRecentLibraryItems = create<RecentsState>()(
  persist(
    (set) => ({
      recents: [],
      addRecent: (item) =>
        set((state) => {
          const k = itemKey(item)
          // Move-to-front semantics: drop any existing entry with the same
          // key before prepending so the most-recently-used always sits at
          // the head of the list, then cap the tail.
          const next = [item, ...state.recents.filter((i) => itemKey(i) !== k)]
          if (next.length > MAX_RECENTS) next.length = MAX_RECENTS
          return { recents: next }
        }),
      clear: () => set({ recents: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
