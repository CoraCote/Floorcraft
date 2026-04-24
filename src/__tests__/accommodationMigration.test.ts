import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'
import type { Employee } from '../types/employee'

const SAVE_KEY = 'floocraft-autosave'

/**
 * Accommodation-field migration: legacy payloads predate the field
 * entirely, and we've seen corrupted/truncated entries arriving via
 * older exports. The migration MUST:
 *   1. Default missing/non-array `accommodations` to `[]`.
 *   2. Drop entries missing `id` / missing `type` / with unknown `type`.
 *   3. Preserve valid entries verbatim (round-trip).
 *
 * Matches the localStorage-shim pattern used in `employeeMigration.test.ts`.
 */

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

describe('Accommodation migration (migrateEmployees)', () => {
  it('back-fills missing accommodations to []', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(payload({ e1: baseEmployee() })),
    )
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(Array.isArray(e.accommodations)).toBe(true)
    expect(e.accommodations).toEqual([])
  })

  it('coerces non-array accommodations to []', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(
        payload({
          e1: baseEmployee({ accommodations: 'not-an-array' }),
        }),
      ),
    )
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.accommodations).toEqual([])
  })

  it('drops entries with unknown type (with console.warn)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(
        payload({
          e1: baseEmployee({
            accommodations: [
              { id: 'a1', type: 'quiet-zone', notes: null, createdAt: '2026-01-01T00:00:00Z' },
              { id: 'a2', type: 'space-laser', notes: null, createdAt: '2026-01-01T00:00:00Z' },
            ],
          }),
        }),
      ),
    )
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.accommodations.length).toBe(1)
    expect(e.accommodations[0].type).toBe('quiet-zone')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('drops entries missing id', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(
        payload({
          e1: baseEmployee({
            accommodations: [
              { type: 'wheelchair-access', notes: null, createdAt: '2026-01-01T00:00:00Z' },
              { id: 'a2', type: 'standing-desk', notes: null, createdAt: '2026-01-01T00:00:00Z' },
            ],
          }),
        }),
      ),
    )
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.accommodations.length).toBe(1)
    expect(e.accommodations[0].id).toBe('a2')
    warnSpy.mockRestore()
  })

  it('round-trips a valid entry', () => {
    const entry = {
      id: 'a1',
      type: 'wheelchair-access' as const,
      notes: 'Prefers ground floor',
      createdAt: '2026-02-15T12:00:00Z',
    }
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(
        payload({
          e1: baseEmployee({ accommodations: [entry] }),
        }),
      ),
    )
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.accommodations).toEqual([entry])
  })
})
