import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { loadAutoSave } from '../hooks/useAutoSave'
import type { WallElement } from '../types/elements'

const SAVE_KEY = 'floocraft-autosave'

// Node 25 ships an experimental built-in localStorage that shadows jsdom's,
// and it doesn't implement .clear(). Swap in a tiny in-memory shim so these
// tests only exercise the save/load shape logic.
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

describe('Wall persistence', () => {
  it('round-trips bulges through localStorage', () => {
    const wall: WallElement = {
      id: 'w1',
      type: 'wall',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: 1,
      label: 'Wall',
      visible: true,
      style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
      points: [0, 0, 100, 0, 200, 0],
      bulges: [0, 10],
      thickness: 6,
      connectedWallIds: [],
    }
    const payload = {
      project: null,
      elements: { w1: wall },
      employees: [],
      departmentColors: {},
      floors: [],
      activeFloorId: null,
      settings: {},
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))

    const loaded = loadAutoSave()!
    const w = (loaded.elements as Record<string, WallElement>).w1
    expect(w.bulges).toEqual([0, 10])
    expect(w.points).toEqual([0, 0, 100, 0, 200, 0])
  })

  it('legacy wall with no bulges field loads with bulges undefined', () => {
    const legacyWall = {
      id: 'w1',
      type: 'wall',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: 1,
      label: 'Wall',
      visible: true,
      style: { fill: '#000', stroke: '#111827', strokeWidth: 6, opacity: 1 },
      points: [0, 0, 100, 0],
      thickness: 6,
      connectedWallIds: [],
    }
    const payload = {
      project: null,
      elements: { w1: legacyWall },
      employees: [],
      departmentColors: {},
      floors: [],
      activeFloorId: null,
      settings: {},
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))

    const loaded = loadAutoSave()!
    const w = (loaded.elements as Record<string, WallElement>).w1
    expect(w.bulges).toBeUndefined()
  })
})
