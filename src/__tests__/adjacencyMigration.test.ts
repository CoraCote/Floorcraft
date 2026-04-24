import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'
import type { Employee } from '../types/employee'

/**
 * `sensitivityTags` migration: the field was introduced alongside the
 * adjacency-conflict analyzer; legacy payloads predate it. The migration
 * MUST:
 *   1. Default missing / non-array `sensitivityTags` to `[]`.
 *   2. Drop non-string / empty-string entries.
 *   3. Round-trip a valid array verbatim.
 *
 * Mirrors the localStorage-shim pattern used in `accommodationMigration.test.ts`.
 */

const SAVE_KEY = 'floocraft-autosave'

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

function payload(employees: Record<string, unknown>) {
  return {
    project: null,
    elements: {},
    employees,
    departmentColors: {},
    floors: [],
    activeFloorId: null,
    settings: {},
    savedAt: new Date().toISOString(),
  }
}

function baseEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    name: 'Jane Doe',
    email: '',
    employmentType: 'full-time',
    status: 'active',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('sensitivityTags migration (migrateEmployees)', () => {
  it('back-fills missing sensitivityTags to []', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(payload({ e1: baseEmployee() })),
    )
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(Array.isArray(e.sensitivityTags)).toBe(true)
    expect(e.sensitivityTags).toEqual([])
  })

  it('coerces non-array sensitivityTags to []', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(
        payload({ e1: baseEmployee({ sensitivityTags: 'audit' }) }),
      ),
    )
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.sensitivityTags).toEqual([])
  })

  it('drops non-string / empty entries and keeps valid ones', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(
        payload({
          e1: baseEmployee({
            sensitivityTags: ['audit', '', null, 42, 'legal'],
          }),
        }),
      ),
    )
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.sensitivityTags).toEqual(['audit', 'legal'])
  })

  it('round-trips a valid array', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(
        payload({
          e1: baseEmployee({ sensitivityTags: ['audit', 'compensation'] }),
        }),
      ),
    )
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.sensitivityTags).toEqual(['audit', 'compensation'])
  })
})
