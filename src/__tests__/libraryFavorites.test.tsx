import { describe, it, expect, beforeEach } from 'vitest'
import { useLibraryFavorites, favoriteKey } from '../hooks/useLibraryFavorites'
import type { LibraryItem } from '../components/editor/LeftSidebar/ElementLibrary'

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return { type: 'desk', label: 'A Desk', category: 'Desks', ...overrides }
}

describe('useLibraryFavorites', () => {
  beforeEach(() => {
    // Reset to an empty Set so per-test mutations don't leak.
    useLibraryFavorites.setState({ favorites: new Set<string>() })
    localStorage.clear()
  })

  it('favoriteKey is derived from type+shape (label and category ignored)', () => {
    expect(favoriteKey(item())).toBe('desk')
    expect(favoriteKey(item({ shape: 'l-shape' }))).toBe('desk/l-shape')
    // Label/category don't participate — favourites are per-variant, not per-tile.
    expect(favoriteKey(item({ label: 'Renamed' }))).toBe('desk')
  })

  it('toggleFavorite: first call adds, second removes', () => {
    const a = item()
    useLibraryFavorites.getState().toggleFavorite(a)
    expect(useLibraryFavorites.getState().favorites.has(favoriteKey(a))).toBe(true)
    expect(useLibraryFavorites.getState().isFavorite(a)).toBe(true)

    useLibraryFavorites.getState().toggleFavorite(a)
    expect(useLibraryFavorites.getState().favorites.has(favoriteKey(a))).toBe(false)
  })

  it('two items with different shapes can both be favourited', () => {
    useLibraryFavorites.getState().toggleFavorite(item())
    useLibraryFavorites.getState().toggleFavorite(item({ shape: 'l-shape' }))
    const fav = useLibraryFavorites.getState().favorites
    expect(fav.size).toBe(2)
    expect(fav.has('desk')).toBe(true)
    expect(fav.has('desk/l-shape')).toBe(true)
  })

  it('persists to localStorage as an array and rehydrates into a Set', async () => {
    useLibraryFavorites.getState().toggleFavorite(item())
    // Force the persist middleware to flush and re-hydrate.
    await useLibraryFavorites.persist.rehydrate()
    const favs = useLibraryFavorites.getState().favorites
    expect(favs instanceof Set).toBe(true)
    expect(favs.has('desk')).toBe(true)
  })
})
