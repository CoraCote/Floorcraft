import { describe, it, expect } from 'vitest'
import {
  computeDeskEquipmentStatus,
  statusColor,
  type EquippableDesk,
} from '../lib/equipmentOverlay'
import type { Employee } from '../types/employee'
import type { DeskElement } from '../types/elements'

/**
 * Pure-logic tests for the equipment-needs overlay status calculator.
 * Every combination of (needs-empty / subset / overlap / disjoint) x
 * (desk has / lacks equipment) x (assigned / unassigned) is covered so
 * a regression in the matcher fails loudly here rather than in a
 * visual-only Konva test.
 */

function emp(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id ?? 'emp-1',
    name: overrides.name ?? 'Test Employee',
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
    leaveType: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    departureDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: null,
    tags: [],
    accommodations: [],
    sensitivityTags: [],
    pendingStatusChanges: [],
    seatId: null,
    floorId: null,
    createdAt: '2026-01-01',
    ...overrides,
  }
}

function desk(overrides: Partial<DeskElement> = {}): EquippableDesk {
  return {
    id: 'd1',
    type: 'desk',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: 'D-1',
    assignedEmployeeId: null,
    capacity: 1,
    ...overrides,
  } as EquippableDesk
}

describe('computeDeskEquipmentStatus', () => {
  it('returns "na" when the employee is null (desk unassigned)', () => {
    expect(computeDeskEquipmentStatus(desk({ equipment: ['monitor'] }), null)).toBe(
      'na',
    )
  })

  it('returns "na" when the employee has no equipmentNeeds', () => {
    const e = emp({ equipmentNeeds: [] })
    expect(computeDeskEquipmentStatus(desk({ equipment: ['monitor'] }), e)).toBe(
      'na',
    )
  })

  it('returns "ok" when every need is present on the desk', () => {
    const e = emp({ equipmentNeeds: ['monitor', 'standing-desk'] })
    const d = desk({ equipment: ['monitor', 'standing-desk', 'keyboard'] })
    expect(computeDeskEquipmentStatus(d, e)).toBe('ok')
  })

  it('returns "ok" for the exact-match case', () => {
    const e = emp({ equipmentNeeds: ['monitor'] })
    const d = desk({ equipment: ['monitor'] })
    expect(computeDeskEquipmentStatus(d, e)).toBe('ok')
  })

  it('returns "partial" when at least one need is met and one is missing', () => {
    const e = emp({ equipmentNeeds: ['monitor', 'standing-desk'] })
    const d = desk({ equipment: ['monitor'] })
    expect(computeDeskEquipmentStatus(d, e)).toBe('partial')
  })

  it('returns "missing" when the employee has needs but the desk has none of them', () => {
    const e = emp({ equipmentNeeds: ['monitor', 'standing-desk'] })
    const d = desk({ equipment: ['keyboard'] })
    expect(computeDeskEquipmentStatus(d, e)).toBe('missing')
  })

  it('returns "missing" when the desk has no equipment at all but needs exist', () => {
    const e = emp({ equipmentNeeds: ['monitor'] })
    expect(computeDeskEquipmentStatus(desk({ equipment: [] }), e)).toBe('missing')
  })

  it('treats an undefined desk.equipment as an empty array', () => {
    const e = emp({ equipmentNeeds: ['monitor'] })
    const d = desk({}) // equipment omitted
    expect(computeDeskEquipmentStatus(d, e)).toBe('missing')
  })

  it('is case-insensitive and trims whitespace', () => {
    const e = emp({ equipmentNeeds: ['Monitor', ' Standing-Desk '] })
    const d = desk({ equipment: ['monitor ', 'standing-desk'] })
    expect(computeDeskEquipmentStatus(d, e)).toBe('ok')
  })
})

describe('statusColor', () => {
  it('returns a distinct colour per status', () => {
    const ok = statusColor('ok')
    const partial = statusColor('partial')
    const missing = statusColor('missing')
    const na = statusColor('na')
    const set = new Set([ok, partial, missing, na])
    expect(set.size).toBe(4)
  })

  it('encodes ok as green, partial as amber, missing as red', () => {
    // Colour sanity: emerald-500 RGB ≈ 16/185/129, amber-500 ≈ 245/158/11,
    // red-500 ≈ 239/68/68. Pattern-matching rather than exact-match so
    // later opacity tweaks don't break the test.
    expect(statusColor('ok')).toMatch(/16,\s*185,\s*129/)
    expect(statusColor('partial')).toMatch(/245,\s*158,\s*11/)
    expect(statusColor('missing')).toMatch(/239,\s*68,\s*68/)
  })

  it('returns a fully-transparent colour for na', () => {
    expect(statusColor('na')).toMatch(/0,\s*0,\s*0,\s*0\)/)
  })
})
