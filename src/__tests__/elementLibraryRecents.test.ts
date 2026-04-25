import { describe, it, expect, beforeEach } from 'vitest'
import {
  addRecent,
  getRecents,
  clearRecents,
  ELEMENT_LIBRARY_RECENTS_KEY,
  ELEMENT_LIBRARY_RECENTS_MAX,
} from '../lib/elementLibraryRecents'
import type { LibraryItem } from '../components/editor/LeftSidebar/ElementLibrary'

function item(label: string, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return { type: 'desk', label, category: 'Desks', ...overrides }
}

describe('elementLibraryRecents', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns [] when no recents are stored', () => {
    expect(getRecents()).toEqual([])
  })

  it('addRecent persists to localStorage and returns the new list', () => {
    const a = item('A')
    const result = addRecent(a)
    expect(result).toEqual([a])
    expect(getRecents()).toEqual([a])
  })

  it('dedupes by type+shape: re-adding the same key bumps to front, no duplicate', () => {
    const a = item('A')
    const b = item('B', { shape: 'l-shape' })
    addRecent(a)
    addRecent(b)
    const final = addRecent(a)
    expect(final).toHaveLength(2)
    expect(final[0].label).toBe('A')
    expect(final[1].label).toBe('B')
  })

  it(`caps at ${ELEMENT_LIBRARY_RECENTS_MAX}: adding one more drops the oldest`, () => {
    // Distinct keys via shape discriminator so dedup doesn't fold them.
    for (let i = 1; i <= ELEMENT_LIBRARY_RECENTS_MAX + 2; i++) {
      addRecent({
        type: 'decor',
        shape: `variant-${i}`,
        label: `L${i}`,
        category: 'X',
      })
    }
    const recents = getRecents()
    expect(recents).toHaveLength(ELEMENT_LIBRARY_RECENTS_MAX)
    // Most recent is at head; oldest two are dropped.
    const last = ELEMENT_LIBRARY_RECENTS_MAX + 2
    expect(recents[0].label).toBe(`L${last}`)
    expect(recents.find((r) => r.label === 'L1')).toBeUndefined()
    expect(recents.find((r) => r.label === 'L2')).toBeUndefined()
  })

  it('returns [] on malformed JSON in storage (parse-fail safety)', () => {
    localStorage.setItem(ELEMENT_LIBRARY_RECENTS_KEY, '{not valid json')
    expect(getRecents()).toEqual([])
  })

  it('returns [] when stored payload is not an array', () => {
    localStorage.setItem(
      ELEMENT_LIBRARY_RECENTS_KEY,
      JSON.stringify({ recents: [] }),
    )
    expect(getRecents()).toEqual([])
  })

  it('filters out structurally-invalid entries (missing required fields)', () => {
    localStorage.setItem(
      ELEMENT_LIBRARY_RECENTS_KEY,
      JSON.stringify([
        item('Good'),
        { type: 'desk' }, // missing label + category
        null,
        'string',
      ]),
    )
    const recents = getRecents()
    expect(recents).toHaveLength(1)
    expect(recents[0].label).toBe('Good')
  })

  it('clearRecents wipes storage', () => {
    addRecent(item('A'))
    clearRecents()
    expect(getRecents()).toEqual([])
  })
})
