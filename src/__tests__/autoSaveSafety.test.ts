import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { loadAutoSave } from '../hooks/useAutoSave'

const SAVE_KEY = 'floocraft-autosave'

// Same shim pattern as wallAutoSave.test.ts — Node 25's experimental
// localStorage shadows jsdom's and doesn't implement .clear().
beforeAll(() => {
  const store = new Map<string, string>()
  const shim: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => {
      store.delete(k)
    },
    setItem: (k, v) => {
      store.set(k, String(v))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    configurable: true,
    writable: true,
  })
})

beforeEach(() => {
  localStorage.clear()
})

describe('loadAutoSave safety net', () => {
  it('returns null for a non-JSON payload without throwing', () => {
    localStorage.setItem(SAVE_KEY, 'definitely not json {')
    expect(loadAutoSave()).toBeNull()
  })

  it('rejects payloads where elements is the wrong shape (string)', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ elements: 'oops', employees: {} }),
    )
    expect(loadAutoSave()).toBeNull()
  })

  it('coerces an array-shaped employees field to an empty object', () => {
    // Legacy payloads can show up with `employees: []` (e.g. a fresh
    // project persisted before the store switched to a keyed Record).
    // The loader must normalise instead of rejecting — otherwise every
    // legacy user loses their whole save.
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        elements: { a: { id: 'a', type: 'desk' } },
        employees: [],
      }),
    )
    const loaded = loadAutoSave()
    expect(loaded).not.toBeNull()
    // Phantom numeric keys would show up as `"0"`, `"1"` etc. Assert none
    // snuck through.
    expect(Object.keys(loaded!.employees ?? {})).toEqual([])
    // The element from the good branch of the payload survives.
    expect(Object.keys(loaded!.elements ?? {})).toEqual(['a'])
  })

  it('coerces an array-shaped elements field instead of passing numeric keys through', () => {
    // Defence-in-depth: even if someone managed to stuff an array into
    // `elements`, we refuse to let `Object.entries` emit numeric string
    // keys downstream.
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        elements: [{ id: 'a', type: 'desk' }],
        employees: {},
      }),
    )
    const loaded = loadAutoSave()
    expect(loaded).not.toBeNull()
    expect(Object.keys(loaded!.elements ?? {})).toEqual([])
  })
})
