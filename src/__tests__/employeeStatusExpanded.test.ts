import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'
import {
  isEmployeeStatus,
  EMPLOYEE_STATUSES,
  type Employee,
} from '../types/employee'

const SAVE_KEY = 'floocraft-autosave'

// Same localStorage shim the peer migration tests use — Node 25 ships an
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

describe('EmployeeStatus — expanded set', () => {
  it('isEmployeeStatus accepts every new value', () => {
    for (const s of [
      'active',
      'on-leave',
      'departed',
      'parental-leave',
      'sabbatical',
      'contractor',
      'intern',
    ]) {
      expect(isEmployeeStatus(s)).toBe(true)
    }
  })

  it('isEmployeeStatus still rejects nonsense', () => {
    expect(isEmployeeStatus('fired')).toBe(false)
    expect(isEmployeeStatus('')).toBe(false)
    expect(isEmployeeStatus(null)).toBe(false)
    expect(isEmployeeStatus(42)).toBe(false)
  })

  it('EMPLOYEE_STATUSES contains all 7 values', () => {
    expect([...EMPLOYEE_STATUSES].sort()).toEqual(
      [
        'active',
        'contractor',
        'departed',
        'intern',
        'on-leave',
        'parental-leave',
        'sabbatical',
      ].sort(),
    )
  })

  it('migration preserves each of the new valid values', () => {
    const mk = (id: string, status: string) => ({
      id,
      name: `P-${id}`,
      email: '',
      employmentType: 'full-time',
      status,
      createdAt: new Date().toISOString(),
    })
    const input: Record<string, unknown> = {}
    for (const s of [
      'parental-leave',
      'sabbatical',
      'contractor',
      'intern',
    ]) {
      input[s] = mk(s, s)
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload(input)))
    const loaded = loadAutoSave()!
    const employees = loaded.employees as Record<string, Employee>
    expect(employees['parental-leave'].status).toBe('parental-leave')
    expect(employees['sabbatical'].status).toBe('sabbatical')
    expect(employees['contractor'].status).toBe('contractor')
    expect(employees['intern'].status).toBe('intern')
  })

  it('migration still coerces values not in the expanded list to "active"', () => {
    const bogus = {
      id: 'e1',
      name: 'Unknown',
      email: '',
      employmentType: 'full-time',
      status: 'ghost-status',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload({ e1: bogus })))
    const loaded = loadAutoSave()!
    const e = (loaded.employees as Record<string, Employee>).e1
    expect(e.status).toBe('active')
  })
})
