import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const STORAGE_KEY = 'floocraft.library.collapsed'

interface CollapseState {
  /** Map of category-id → collapsed? (true = hidden). Missing key = expanded. */
  collapsed: Record<string, boolean>
  toggleCategory: (cat: string) => void
}

export const useLibraryCollapse = create<CollapseState>()(
  persist(
    (set) => ({
      collapsed: {},
      toggleCategory: (cat) =>
        set((state) => ({
          collapsed: { ...state.collapsed, [cat]: !state.collapsed[cat] },
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
