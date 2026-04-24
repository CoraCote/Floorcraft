import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'
import type { WallElement } from '../types/elements'

const SAVE_KEY = 'floocraft-autosave'

// Node's experimental built-in localStorage shadows jsdom's; mirror the
// shim used by wallAutoSave.test.ts so both tests exercise the same path.
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

describe('Wall type migration', () => {
  it("legacy wall with no `wallType` is migrated to 'solid'", () => {
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
      // NOTE: no wallType field — this is the legacy shape.
    }
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        project: null,
        elements: { w1: legacyWall },
        employees: [],
        departmentColors: {},
        floors: [],
        activeFloorId: null,
        settings: {},
        savedAt: new Date().toISOString(),
      }),
    )

    const loaded = loadAutoSave()!
    const w = (loaded.elements as Record<string, WallElement>).w1
    expect(w.wallType).toBe('solid')
  })

  it("preserves a valid stored wallType ('glass')", () => {
    const wall = {
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
      style: { fill: '#000', stroke: '#93C5FD', strokeWidth: 6, opacity: 1 },
      points: [0, 0, 100, 0],
      thickness: 6,
      connectedWallIds: [],
      wallType: 'glass',
    }
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        project: null,
        elements: { w1: wall },
        employees: [],
        departmentColors: {},
        floors: [],
        activeFloorId: null,
        settings: {},
        savedAt: new Date().toISOString(),
      }),
    )

    const loaded = loadAutoSave()!
    const w = (loaded.elements as Record<string, WallElement>).w1
    expect(w.wallType).toBe('glass')
  })

  it("coerces an unknown wallType string to 'solid'", () => {
    const wall = {
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
      wallType: 'plasma', // invalid
    }
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        project: null,
        elements: { w1: wall },
        employees: [],
        departmentColors: {},
        floors: [],
        activeFloorId: null,
        settings: {},
        savedAt: new Date().toISOString(),
      }),
    )

    const loaded = loadAutoSave()!
    const w = (loaded.elements as Record<string, WallElement>).w1
    expect(w.wallType).toBe('solid')
  })
})
