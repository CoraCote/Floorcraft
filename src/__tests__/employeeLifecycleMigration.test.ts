import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'

const SAVE_KEY = 'floocraft-autosave'

// Same localStorage shim as employeeMigration.test.ts — Node 25 ships an
// experimental built-in localStorage without .clear(). Tests only exercise
// migration logic so an in-memory map is plenty.
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

const basePayload = {
  project: { id: 'p', slug: 'p', name: 'P' },
  elements: {},
  employees: {},
  departmentColors: {},
  floors: [{ id: 'f', name: 'F', order: 0, elements: {} }],
  activeFloorId: 'f',
  settings: {},
}

function seed(payload: unknown) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
}

describe('migrateEmployees — Phase 4 lifecycle fields', () => {
  it('back-fills all five new fields to null on legacy employees', () => {
    seed({
      ...basePayload,
      employees: {
        e1: {
          id: 'e1',
          name: 'Alice',
          status: 'active',
        },
      },
    })
    const loaded = loadAutoSave()
    const e1 = loaded?.employees.e1 as Record<string, unknown> | undefined
    expect(e1).toBeDefined()
    expect(e1?.leaveType).toBeNull()
    expect(e1?.expectedReturnDate).toBeNull()
    expect(e1?.coverageEmployeeId).toBeNull()
    expect(e1?.leaveNotes).toBeNull()
    expect(e1?.departureDate).toBeNull()
  })

  it('preserves valid existing values', () => {
    seed({
      ...basePayload,
      employees: {
        e1: {
          id: 'e1',
          name: 'Bob',
          status: 'on-leave',
          leaveType: 'parental',
          expectedReturnDate: '2026-09-01',
          coverageEmployeeId: 'e2',
          leaveNotes: 'Back-up contact: Carol',
          departureDate: null,
        },
      },
    })
    const loaded = loadAutoSave()
    const e1 = loaded?.employees.e1 as Record<string, unknown> | undefined
    expect(e1?.leaveType).toBe('parental')
    expect(e1?.expectedReturnDate).toBe('2026-09-01')
    expect(e1?.coverageEmployeeId).toBe('e2')
    expect(e1?.leaveNotes).toBe('Back-up contact: Carol')
    expect(e1?.departureDate).toBeNull()
  })

  it('coerces invalid leaveType values to null', () => {
    seed({
      ...basePayload,
      employees: {
        e1: { id: 'e1', name: 'Dan', status: 'on-leave', leaveType: 'nonsense' },
      },
    })
    const loaded = loadAutoSave()
    const e1 = loaded?.employees.e1 as Record<string, unknown> | undefined
    expect(e1?.leaveType).toBeNull()
  })
})
