import { describe, it, expect, beforeEach } from 'vitest'
import {
  addRecent,
  getRecents,
  getScope,
  setScope,
  RECENTS_STORAGE_KEY,
  SCOPE_STORAGE_KEY,
  MAX_RECENT_COMMANDS,
  DEFAULT_SCOPE,
  __clearRecentsForTests,
} from '../lib/commandPaletteRecents'

/**
 * Pure-helper tests for the palette's local-persistence layer. We work
 * directly against `window.localStorage` (jsdom default) rather than
 * mocking — the helper's whole job is to be a defensive wrapper, and
 * mocking storage would let real bugs slip past.
 */

beforeEach(() => {
  // Both slots get nuked between tests so cross-test pollution can't
  // accidentally validate a stale write.
  window.localStorage.removeItem(RECENTS_STORAGE_KEY)
  window.localStorage.removeItem(SCOPE_STORAGE_KEY)
})

describe('commandPaletteRecents — addRecent / getRecents', () => {
  it('returns [] when storage is empty', () => {
    expect(getRecents()).toEqual([])
  })

  it('addRecent prepends the id and persists it', () => {
    const next = addRecent('action-export')
    expect(next).toEqual(['action-export'])
    // Reading back through getRecents should match — proves the value
    // round-trips through localStorage rather than only the in-memory
    // return.
    expect(getRecents()).toEqual(['action-export'])
  })

  it('deduplicates existing ids by moving them to the front', () => {
    addRecent('a')
    addRecent('b')
    addRecent('c')
    // Touch 'a' again — should jump to the front, not duplicate.
    const after = addRecent('a')
    expect(after).toEqual(['a', 'c', 'b'])
    expect(getRecents()).toEqual(['a', 'c', 'b'])
  })

  it(`caps the list at MAX_RECENT_COMMANDS (${MAX_RECENT_COMMANDS})`, () => {
    // Push one extra so the oldest must fall off.
    const ids = Array.from({ length: MAX_RECENT_COMMANDS + 1 }, (_, i) => `id-${i}`)
    let last: string[] = []
    for (const id of ids) last = addRecent(id)
    expect(last.length).toBe(MAX_RECENT_COMMANDS)
    // Newest first → final id at the head, oldest pushed off the tail.
    expect(last[0]).toBe(`id-${MAX_RECENT_COMMANDS}`)
    expect(last).not.toContain('id-0')
  })

  it('getRecents returns [] when the persisted JSON is corrupt', () => {
    window.localStorage.setItem(RECENTS_STORAGE_KEY, '{not json')
    expect(getRecents()).toEqual([])
    // Side-effect: corrupt slot is wiped so subsequent reads are O(0).
    expect(window.localStorage.getItem(RECENTS_STORAGE_KEY)).toBeNull()
  })

  it('getRecents returns [] when the persisted value is the wrong shape', () => {
    window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    expect(getRecents()).toEqual([])
  })

  it('getRecents filters out non-string entries from a partly-corrupt slot', () => {
    // Mixed array — strings should survive, others get dropped.
    window.localStorage.setItem(
      RECENTS_STORAGE_KEY,
      JSON.stringify(['a', 42, null, 'b']),
    )
    expect(getRecents()).toEqual(['a', 'b'])
  })

  it('__clearRecentsForTests wipes the slot', () => {
    addRecent('x')
    expect(getRecents()).toEqual(['x'])
    __clearRecentsForTests()
    expect(getRecents()).toEqual([])
  })
})

describe('commandPaletteRecents — getScope / setScope', () => {
  it(`returns the default scope (${DEFAULT_SCOPE}) when nothing is persisted`, () => {
    expect(getScope()).toBe(DEFAULT_SCOPE)
  })

  it('round-trips a valid scope value', () => {
    setScope('all')
    expect(getScope()).toBe('all')
    setScope('office')
    expect(getScope()).toBe('office')
  })

  it('falls back to the default when the persisted value is unknown', () => {
    // Simulate a future-version write that the current build doesn't
    // recognise — we should not crash and not preserve the stale value.
    window.localStorage.setItem(SCOPE_STORAGE_KEY, 'galaxy')
    expect(getScope()).toBe(DEFAULT_SCOPE)
  })
})
