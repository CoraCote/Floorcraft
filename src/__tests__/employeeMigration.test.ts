import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'
import type { Employee } from '../types/employee'

const SAVE_KEY = 'floocraft-autosave'

// Same localStorage shim as wallAutoSave.test.ts — Node 25 ships an
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

describe('Employee migration (loadAutoSave)', () => {
  it('back-fills status to "active" when the field is absent', () => {
    const legacy = {
      id: 'e1',
      name: 'Jane Doe',
      email: '',
      department: null,
      team: null,
      title: null,
      managerId: null,
      employmentType: 'full-time',
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
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload({ e1: legacy })))

    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.status).toBe('active')
  })

  it('coerces unknown status values to "active"', () => {
    const bogus = {
      id: 'e1',
      name: 'Jane Doe',
      status: 'vacationing', // not a valid EmployeeStatus
      email: '',
      employmentType: 'full-time',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload({ e1: bogus })))

    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.status).toBe('active')
  })

  it('preserves valid status values', () => {
    const onLeave = {
      id: 'e1',
      name: 'Jane Doe',
      status: 'on-leave',
      email: '',
      employmentType: 'full-time',
      createdAt: new Date().toISOString(),
    }
    const departed = {
      id: 'e2',
      name: 'John Smith',
      status: 'departed',
      email: '',
      employmentType: 'full-time',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(payload({ e1: onLeave, e2: departed })),
    )

    const loaded = loadAutoSave()!
    const employees = loaded.employees as Record<string, Employee>
    expect(employees.e1.status).toBe('on-leave')
    expect(employees.e2.status).toBe('departed')
  })
})
