/**
 * Pure localStorage helper for the left-sidebar Element Library's "Recent"
 * row. Independent from the older `useRecentLibraryItems` zustand hook —
 * Wave 12B introduced this to consolidate per-feature recents helpers
 * around a small functional API (`addRecent`, `getRecents`) that's trivial
 * to unit-test.
 *
 * Storage key is namespaced under the `floocraft.` prefix that the rest of
 * the app uses for client-side persistence (see `useLibraryFavorites`,
 * `useLibraryCollapse`, etc.). The shape is the bare list of recent
 * library item descriptors — no version field; if the schema ever changes
 * we treat parse-failures as "no recents" (see `getRecents`).
 */
import type { LibraryItem } from '../components/editor/LeftSidebar/ElementLibrary'

export const ELEMENT_LIBRARY_RECENTS_KEY = 'floocraft.elementLibrary.recent'
export const ELEMENT_LIBRARY_RECENTS_MAX = 5

/** Stable identity key for an item. Same type+shape collapses to one slot. */
function itemKey(item: LibraryItem): string {
  return `${item.type}${item.shape ? `/${item.shape}` : ''}`
}

/**
 * Read recents from localStorage. Returns an empty list on missing,
 * malformed JSON, or a non-array payload — callers never need to deal
 * with corrupted state. SSR-safe (returns [] when localStorage missing).
 */
export function getRecents(): LibraryItem[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(ELEMENT_LIBRARY_RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Trust the shape for now — type/label/category are required, the
    // rest are optional. Tile renderers tolerate partial data via the
    // existing LibraryPreview fallbacks.
    return parsed.filter(
      (entry): entry is LibraryItem =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.type === 'string' &&
        typeof entry.label === 'string' &&
        typeof entry.category === 'string',
    )
  } catch {
    return []
  }
}

/**
 * Move-to-front semantics: bumps `item` to position 0, dedupes by
 * type+shape so re-using the same tile doesn't fill the row with copies,
 * and caps at ELEMENT_LIBRARY_RECENTS_MAX. Returns the new list so
 * callers can update React state without an extra read.
 */
export function addRecent(item: LibraryItem): LibraryItem[] {
  const current = getRecents()
  const k = itemKey(item)
  const next = [item, ...current.filter((i) => itemKey(i) !== k)]
  if (next.length > ELEMENT_LIBRARY_RECENTS_MAX) {
    next.length = ELEMENT_LIBRARY_RECENTS_MAX
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ELEMENT_LIBRARY_RECENTS_KEY, JSON.stringify(next))
    }
  } catch {
    // Quota errors etc. — return the in-memory list anyway so the UI
    // updates this session even if persistence failed.
  }
  return next
}

/** Clear recents. Mostly for tests; no UI surface today. */
export function clearRecents(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ELEMENT_LIBRARY_RECENTS_KEY)
    }
  } catch {
    /* ignore */
  }
}
