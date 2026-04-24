import { describe, it, expect } from 'vitest'
import {
  canReserveDesk,
  isStale,
  reservationsForDate,
  employeeReservationsByDate,
  canCreateReservation,
  todayIso,
} from '../lib/reservations'
import type { CanvasElement } from '../types/elements'
import type { SeatStatus } from '../types/seatAssignment'
import type { DeskReservation } from '../types/reservations'

function desk(
  id: string,
  assigned: string | null = null,
  seatStatus?: SeatStatus,
): CanvasElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    deskId: id,
    assignedEmployeeId: assigned,
    capacity: 1,
    seatStatus,
  } as unknown as CanvasElement
}

function phoneBooth(id: string): CanvasElement {
  return {
    id,
    type: 'phone-booth',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
  } as unknown as CanvasElement
}

function res(over: Partial<DeskReservation> = {}): DeskReservation {
  return {
    id: 'r-' + Math.random().toString(36).slice(2, 8),
    deskElementId: 'd1',
    employeeId: 'e1',
    date: '2026-04-25',
    createdAt: new Date().toISOString(),
    ...over,
  }
}

describe('canReserveDesk', () => {
  it('accepts unassigned desks with no seatStatus override', () => {
    expect(canReserveDesk(desk('d1'))).toBe(true)
  })
  it('rejects desks with an assigned employee', () => {
    expect(canReserveDesk(desk('d1', 'e1'))).toBe(false)
  })
  it('rejects decommissioned desks even if unassigned', () => {
    expect(canReserveDesk(desk('d1', null, 'decommissioned'))).toBe(false)
  })
  it('rejects non-desk elements like phone booths', () => {
    expect(canReserveDesk(phoneBooth('p1'))).toBe(false)
  })
})

describe('isStale', () => {
  it('returns true for reservations strictly before today', () => {
    expect(isStale(res({ date: '2026-04-20' }), '2026-04-24')).toBe(true)
  })
  it('returns false for today and future reservations', () => {
    expect(isStale(res({ date: '2026-04-24' }), '2026-04-24')).toBe(false)
    expect(isStale(res({ date: '2026-05-01' }), '2026-04-24')).toBe(false)
  })
})

describe('reservationsForDate', () => {
  it('returns only reservations matching the given date, keyed by desk', () => {
    const list = [
      res({ id: 'a', deskElementId: 'd1', date: '2026-04-25' }),
      res({ id: 'b', deskElementId: 'd2', date: '2026-04-25' }),
      res({ id: 'c', deskElementId: 'd1', date: '2026-04-26' }),
    ]
    const m = reservationsForDate(list, '2026-04-25')
    expect(Object.keys(m).sort()).toEqual(['d1', 'd2'])
    expect(m.d1.id).toBe('a')
  })
  it('returns an empty map when no reservations match', () => {
    expect(reservationsForDate([], '2026-04-25')).toEqual({})
  })
})

describe('employeeReservationsByDate', () => {
  it('indexes one employees dates into a set', () => {
    const list = [
      res({ employeeId: 'e1', date: '2026-04-25' }),
      res({ employeeId: 'e1', date: '2026-04-26' }),
      res({ employeeId: 'e2', date: '2026-04-25' }),
    ]
    const idx = employeeReservationsByDate(list)
    expect(Array.from(idx.e1).sort()).toEqual(['2026-04-25', '2026-04-26'])
    expect(Array.from(idx.e2)).toEqual(['2026-04-25'])
  })
})

describe('canCreateReservation', () => {
  it('returns null when everything is valid', () => {
    expect(canCreateReservation([], desk('d1'), 'e1', '2026-04-25')).toBeNull()
  })
  it('rejects non-reservable desks with a specific tag', () => {
    expect(canCreateReservation([], desk('d1', 'e1'), 'e1', '2026-04-25')).toBe(
      'desk-not-reservable',
    )
  })
  it('rejects a second reservation for the same desk+date', () => {
    const list = [res({ deskElementId: 'd1', date: '2026-04-25', employeeId: 'ex' })]
    expect(canCreateReservation(list, desk('d1'), 'e1', '2026-04-25')).toBe(
      'desk-already-reserved',
    )
  })
  it('rejects a second reservation for the same employee+date', () => {
    const list = [res({ deskElementId: 'd9', date: '2026-04-25', employeeId: 'e1' })]
    expect(canCreateReservation(list, desk('d1'), 'e1', '2026-04-25')).toBe(
      'employee-already-booked',
    )
  })
  it('allows same employee on different dates', () => {
    const list = [res({ deskElementId: 'd9', date: '2026-04-26', employeeId: 'e1' })]
    expect(canCreateReservation(list, desk('d1'), 'e1', '2026-04-25')).toBeNull()
  })
})

describe('todayIso', () => {
  it('formats as YYYY-MM-DD using local calendar fields', () => {
    const d = new Date(2026, 3, 24) // April 24, 2026 local
    expect(todayIso(d)).toBe('2026-04-24')
  })
  it('zero-pads months and days', () => {
    const d = new Date(2026, 0, 3)
    expect(todayIso(d)).toBe('2026-01-03')
  })
})
