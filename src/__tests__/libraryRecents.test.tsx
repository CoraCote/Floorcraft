import { describe, it, expect, beforeEach } from 'vitest'
import { useRecentLibraryItems } from '../hooks/useRecentLibraryItems'
import type { LibraryItem } from '../components/editor/LeftSidebar/ElementLibrary'

function item(label: string, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return { type: 'desk', label, category: 'Desks', ...overrides }
}

describe('useRecentLibraryItems', () => {
  beforeEach(() => {
    useRecentLibraryItems.getState().clear()
    localStorage.clear()
  })

  it('adds a recent and surfaces it in the list', () => {
    const a = item('A')
    useRecentLibraryItems.getState().addRecent(a)
    expect(useRecentLibraryItems.getState().recents).toEqual([a])
  })

  it('dedupes by type+shape: re-adding the same key moves to front, does not duplicate', () => {
    // Two distinct keys: desk (no shape) and desk/l-shape. That way adding
    // A again after B surfaces A at the head without collapsing B.
    const a = item('A')
    const b = item('B', { shape: 'l-shape' })
    useRecentLibraryItems.getState().addRecent(a)
    useRecentLibraryItems.getState().addRecent(b)
    useRecentLibraryItems.getState().addRecent(a)
    const recents = useRecentLibraryItems.getState().recents
    expect(recents).toHaveLength(2)
    expect(recents[0].label).toBe('A')
    expect(recents[1].label).toBe('B')
  })

  it('caps at 6 entries: adding a 7th drops the oldest', () => {
    const store = useRecentLibraryItems.getState()
    // Distinct keys via shape discriminator so dedup doesn't fold them.
    for (let i = 1; i <= 7; i++) {
      store.addRecent({ type: 'decor', shape: `variant-${i}`, label: `L${i}`, category: 'X' })
    }
    const recents = useRecentLibraryItems.getState().recents
    expect(recents).toHaveLength(6)
    // Most recent is L7 at head; the oldest (L1) was dropped.
    expect(recents[0].label).toBe('L7')
    expect(recents.find((r) => r.label === 'L1')).toBeUndefined()
    expect(recents.find((r) => r.label === 'L2')?.label).toBe('L2')
  })

  it('persists across rehydration via the zustand persist adapter', async () => {
    useRecentLibraryItems.getState().addRecent(item('Persisted'))
    // Force the persist middleware to flush; then re-hydrate.
    await useRecentLibraryItems.persist.rehydrate()
    expect(useRecentLibraryItems.getState().recents[0].label).toBe('Persisted')
  })
})
