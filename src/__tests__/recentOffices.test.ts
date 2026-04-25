import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  addRecent,
  getRecents,
  __clearRecentsForTests,
} from '../lib/recentOffices'

const KEY = 'floocraft.recentOffices'

beforeEach(() => {
  __clearRecentsForTests()
})

describe('recentOffices', () => {
  it('returns [] when storage is empty', () => {
    expect(getRecents()).toEqual([])
  })

  it('addRecent prepends new slugs in MRU order', () => {
    addRecent('a')
    addRecent('b')
    addRecent('c')
    expect(getRecents()).toEqual(['c', 'b', 'a'])
  })

  it('dedupes — re-adding a slug moves it to the head without duplication', () => {
    addRecent('a')
    addRecent('b')
    addRecent('a')
    expect(getRecents()).toEqual(['a', 'b'])
  })

  it('caps the list at 5 entries', () => {
    for (const slug of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) addRecent(slug)
    const recents = getRecents()
    expect(recents.length).toBe(5)
    // MRU order — 'g' is newest, and anything older than the cap is dropped.
    expect(recents[0]).toBe('g')
    expect(recents).not.toContain('a')
    expect(recents).not.toContain('b')
  })

  it('ignores empty / non-string slugs', () => {
    addRecent('')
    // @ts-expect-error exercising runtime guard
    addRecent(null)
    // @ts-expect-error exercising runtime guard
    addRecent(undefined)
    // @ts-expect-error exercising runtime guard
    addRecent(42)
    expect(getRecents()).toEqual([])
  })

  it('is parse-safe — malformed JSON collapses to []', () => {
    localStorage.setItem(KEY, '{not-json')
    expect(getRecents()).toEqual([])
  })

  it('is shape-safe — a stored non-array collapses to []', () => {
    localStorage.setItem(KEY, JSON.stringify({ wrong: 'shape' }))
    expect(getRecents()).toEqual([])
  })

  it('drops non-string entries from a mixed array on read', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify(['a', 1, null, 'b', '', 'c']),
    )
    expect(getRecents()).toEqual(['a', 'b', 'c'])
  })

  it('swallows localStorage errors in addRecent', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota')
      })
    expect(() => addRecent('a')).not.toThrow()
    setItemSpy.mockRestore()
  })
})
