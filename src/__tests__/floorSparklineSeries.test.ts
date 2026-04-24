import { describe, it, expect } from 'vitest'
import { floorSparklineSeries } from '../lib/floorSparklineSeries'
import type { SeatHistoryEntry } from '../types/seatHistory'

function mkEntry(overrides: Partial<SeatHistoryEntry> & { timestamp: string }): SeatHistoryEntry {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    seatId: overrides.seatId ?? overrides.elementId ?? 's1',
    elementId: overrides.elementId ?? 's1',
    employeeId: overrides.employeeId ?? 'e1',
    previousEmployeeId: overrides.previousEmployeeId ?? null,
    action: overrides.action ?? 'assign',
    timestamp: overrides.timestamp,
    actorUserId: overrides.actorUserId ?? null,
    note: overrides.note ?? null,
  }
}

describe('floorSparklineSeries', () => {
  // Local-time anchor so tests don't drift with CI timezone.
  const today = new Date(2026, 3, 24, 12, 0, 0) // 2026-04-24 12:00 local

  it('returns exactly 14 points ending on today (default window)', () => {
    const points = floorSparklineSeries([], ['d1'], today)
    expect(points).toHaveLength(14)
    expect(points[13].date).toBe('2026-04-24')
    expect(points[0].date).toBe('2026-04-11')
  })

  it('back-fills sparse days with zero counts', () => {
    const entries: SeatHistoryEntry[] = [
      mkEntry({ elementId: 'd1', timestamp: new Date(2026, 3, 24, 9, 0, 0).toISOString() }),
      mkEntry({ elementId: 'd1', timestamp: new Date(2026, 3, 22, 10, 0, 0).toISOString() }),
    ]
    const points = floorSparklineSeries(entries, ['d1'], today)
    expect(points).toHaveLength(14)
    // All days in the 14-day window are present, but most are zero.
    const nonZero = points.filter((p) => p.assignedSeats > 0)
    expect(nonZero).toHaveLength(2)
    expect(points[points.length - 1]).toEqual({ date: '2026-04-24', assignedSeats: 1 })
    expect(points[points.length - 3]).toEqual({ date: '2026-04-22', assignedSeats: 1 })
    // A day between them is still zero.
    expect(points[points.length - 2].assignedSeats).toBe(0)
  })

  it('trims events outside the 14-day window', () => {
    const entries: SeatHistoryEntry[] = [
      // Inside — today.
      mkEntry({ elementId: 'd1', timestamp: new Date(2026, 3, 24, 9, 0, 0).toISOString() }),
      // Outside — 30 days ago.
      mkEntry({ elementId: 'd1', timestamp: new Date(2026, 2, 25, 9, 0, 0).toISOString() }),
      // Outside — future (clock skew).
      mkEntry({ elementId: 'd1', timestamp: new Date(2026, 4, 1, 9, 0, 0).toISOString() }),
    ]
    const points = floorSparklineSeries(entries, ['d1'], today)
    const total = points.reduce((sum, p) => sum + p.assignedSeats, 0)
    expect(total).toBe(1)
  })

  it('excludes entries whose elementId is not on the target floor', () => {
    const entries: SeatHistoryEntry[] = [
      mkEntry({ elementId: 'd1', timestamp: new Date(2026, 3, 24, 9, 0, 0).toISOString() }),
      mkEntry({ elementId: 'other', timestamp: new Date(2026, 3, 24, 10, 0, 0).toISOString() }),
    ]
    const points = floorSparklineSeries(entries, ['d1'], today)
    const total = points.reduce((sum, p) => sum + p.assignedSeats, 0)
    expect(total).toBe(1)
  })

  it('produces an all-zero 14-point series when history is empty', () => {
    const points = floorSparklineSeries([], ['d1'], today)
    expect(points).toHaveLength(14)
    expect(points.every((p) => p.assignedSeats === 0)).toBe(true)
  })

  it('accepts a Record<id, entry> as well as an array', () => {
    const a = mkEntry({ id: 'a', elementId: 'd1', timestamp: new Date(2026, 3, 24, 9, 0, 0).toISOString() })
    const b = mkEntry({ id: 'b', elementId: 'd1', timestamp: new Date(2026, 3, 23, 9, 0, 0).toISOString() })
    const points = floorSparklineSeries({ a, b }, new Set(['d1']), today)
    const total = points.reduce((sum, p) => sum + p.assignedSeats, 0)
    expect(total).toBe(2)
  })
})
