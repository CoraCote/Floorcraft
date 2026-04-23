import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const STORAGE_KEY = 'floocraft.library.collapsed'

interface CollapseState {
  /** Map of category-id → collapsed? (true = hidden). Missing key falls back
   *  to the per-category default (see `defaultCollapsed`). */
  collapsed: Record<string, boolean>
  toggleCategory: (cat: string) => void
  /**
   * Default collapsed state when no user preference is stored. Everything
   * except "Desks" starts collapsed so a first-time user sees a tidy,
   * scannable library instead of a seven-section wall of 28 tiles. Desks
   * is the most common first placement — leaving it expanded gets people
   * to "drop a desk" without any clicks spent on discovery.
   *
   * Non-collapsible sections ("Recent", "Favorites", search results) never
   * call this — they pass `collapsible={false}` to LibrarySection.
   */
  defaultCollapsed: (cat: string) => boolean
}

function defaultCollapsedFor(cat: string): boolean {
  return cat !== 'Desks'
}

export const useLibraryCollapse = create<CollapseState>()(
  persist(
    (set) => ({
      collapsed: {},
      toggleCategory: (cat) =>
        set((state) => ({
          collapsed: {
            ...state.collapsed,
            // Toggle off the current effective value (stored override OR default)
            // so the first click always flips visibility, not "set to true".
            [cat]:
              !(state.collapsed[cat] ?? defaultCollapsedFor(cat)),
          },
        })),
      defaultCollapsed: defaultCollapsedFor,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
