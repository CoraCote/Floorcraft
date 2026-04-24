import { describe, it, expect } from 'vitest'
import { coerceReservations } from '../lib/offices/reservationsPersistence'

describe('coerceReservations', () => {
  it('returns [] for undefined / null / non-array, non-object inputs', () => {
    expect(coerceReservations(undefined)).toEqual([])
    expect(coerceReservations(null)).toEqual([])
    expect(coerceReservations('foo')).toEqual([])
    expect(coerceReservations(42)).toEqual([])
  })

  it('round-trips a well-formed array', () => {
    const src = [
      {
        id: 'r1',
        deskElementId: 'd1',
        employeeId: 'e1',
        date: '2026-04-25',
        createdAt: '2026-04-24T00:00:00.000Z',
      },
    ]
    expect(coerceReservations(src)).toEqual(src)
  })

  it('drops entries missing required string fields', () => {
    const src = [
      { id: '', deskElementId: 'd1', employeeId: 'e1', date: '2026-04-25' },
      { id: 'r2', deskElementId: '', employeeId: 'e1', date: '2026-04-25' },
      { id: 'r3', deskElementId: 'd3', employeeId: 'e1', date: 'not-a-date' },
      {
        id: 'r4',
        deskElementId: 'd4',
        employeeId: 'e1',
        date: '2026-04-25',
      },
    ]
    const out = coerceReservations(src)
    expect(out.map((r) => r.id)).toEqual(['r4'])
  })

  it('synthesises createdAt when missing so the shape is complete', () => {
    const src = [
      { id: 'r1', deskElementId: 'd1', employeeId: 'e1', date: '2026-04-25' },
    ]
    const out = coerceReservations(src)
    expect(out).toHaveLength(1)
    expect(typeof out[0].createdAt).toBe('string')
    // Should parse as a real ISO date.
    expect(Number.isNaN(Date.parse(out[0].createdAt))).toBe(false)
  })

  it('accepts a keyed-Record shape as a defensive fallback', () => {
    const src = {
      r1: {
        id: 'r1',
        deskElementId: 'd1',
        employeeId: 'e1',
        date: '2026-04-25',
      },
    }
    expect(coerceReservations(src).map((r) => r.id)).toEqual(['r1'])
  })
})
