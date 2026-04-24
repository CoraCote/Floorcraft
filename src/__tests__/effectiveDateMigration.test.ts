import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'
import type { Employee } from '../types/employee'

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

function baseLegacy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'e1',
    name: 'Alice',
    email: '',
    department: null,
    team: null,
    title: null,
    managerId: null,
    employmentType: 'full-time',
    status: 'active',
    officeDays: [],
    startDate: null,
    endDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: null,
    tags: [],
    seatId: null,
    floorId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('pendingStatusChanges migration', () => {
  it('back-fills an empty array when the field is missing', () => {
    const legacy = baseLegacy()
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload({ e1: legacy })))
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.pendingStatusChanges).toEqual([])
  })

  it('drops entries with an invalid effectiveDate and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const legacy = baseLegacy({
      pendingStatusChanges: [
        { id: 'c1', status: 'on-leave', effectiveDate: 'not-a-date', note: null, createdAt: 'x' },
        { id: 'c2', status: 'on-leave', effectiveDate: '2025-06-01', note: null, createdAt: 'x' },
      ],
    })
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload({ e1: legacy })))
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.pendingStatusChanges).toHaveLength(1)
    expect(e.pendingStatusChanges[0].id).toBe('c2')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('drops entries with an unknown status and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const legacy = baseLegacy({
      pendingStatusChanges: [
        { id: 'c1', status: 'vacationing', effectiveDate: '2025-06-01', note: null, createdAt: 'x' },
        { id: 'c2', status: 'sabbatical', effectiveDate: '2025-07-01', note: null, createdAt: 'x' },
      ],
    })
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload({ e1: legacy })))
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.pendingStatusChanges).toHaveLength(1)
    expect(e.pendingStatusChanges[0].status).toBe('sabbatical')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('drops entries with a missing id and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const legacy = baseLegacy({
      pendingStatusChanges: [
        { status: 'on-leave', effectiveDate: '2025-06-01', note: null, createdAt: 'x' },
        { id: 'c2', status: 'sabbatical', effectiveDate: '2025-07-01', note: null, createdAt: 'x' },
      ],
    })
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload({ e1: legacy })))
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.pendingStatusChanges).toHaveLength(1)
    expect(e.pendingStatusChanges[0].id).toBe('c2')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('round-trips valid entries and sorts them ascending by date', () => {
    const legacy = baseLegacy({
      pendingStatusChanges: [
        { id: 'c2', status: 'active', effectiveDate: '2025-08-01', note: null, createdAt: 'x' },
        { id: 'c1', status: 'on-leave', effectiveDate: '2025-06-01', note: 'parental', createdAt: 'x' },
      ],
    })
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload({ e1: legacy })))
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.pendingStatusChanges.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(e.pendingStatusChanges[0].note).toBe('parental')
  })

  it('treats a non-array pendingStatusChanges as empty and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const legacy = baseLegacy({ pendingStatusChanges: 'oops' })
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload({ e1: legacy })))
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.pendingStatusChanges).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
