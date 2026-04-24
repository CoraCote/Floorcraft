import { describe, it, expect } from 'vitest'
import { bucketEvents, maxCount } from '../lib/churnHeatmap'
import type { SeatHistoryEntry } from '../types/seatHistory'

/**
 * bucketEvents returns a dense week-aligned calendar of `7 * weeks` entries.
 * The *last* entry is always `today`. Out-of-window events are dropped.
 * Entries in-window are counted by calendar day (local time), regardless of
 * the event's hh:mm:ss, so an event at 23:59 still lands on "today".
 */
function mkEntry(overrides: Partial<SeatHistoryEntry> & { timestamp: string }): SeatHistoryEntry {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    seatId: overrides.seatId ?? 's1',
    elementId: overrides.elementId ?? 's1',
    employeeId: overrides.employeeId ?? 'e1',
    previousEmployeeId: overrides.previousEmployeeId ?? null,
    action: overrides.action ?? 'assign',
    timestamp: overrides.timestamp,
    actorUserId: overrides.actorUserId ?? null,
    note: overrides.note ?? null,
  }
}

describe('bucketEvents', () => {
  // Use a local-time "today" (no Z suffix) so tests run stably regardless
  // of the CI timezone. The bucketing logic is local-time too.
  const today = new Date(2025, 5, 30, 12, 0, 0) // 2025-06-30 12:00 local

  it('returns exactly 7 * weeks dense entries (default 13 weeks = 91)', () => {
    const out = bucketEvents([], today)
    expect(out).toHaveLength(91)
  })

  it('honors a custom weeks argument', () => {
    const out = bucketEvents([], today, 4)
    expect(out).toHaveLength(28)
  })

  it('counts events on the correct day', () => {
    const events = [
      mkEntry({ timestamp: new Date(2025, 5, 30, 9, 0, 0).toISOString() }), // today
      mkEntry({ timestamp: new Date(2025, 5, 30, 18, 30, 0).toISOString() }), // today, later
      mkEntry({ timestamp: new Date(2025, 5, 29, 8, 0, 0).toISOString() }), // yesterday
    ]
    const out = bucketEvents(events, today)
    const last = out[out.length - 1]
    expect(last.date).toBe('2025-06-30')
    expect(last.count).toBe(2)
    const yesterday = out[out.length - 2]
    expect(yesterday.date).toBe('2025-06-29')
    expect(yesterday.count).toBe(1)
  })

  it('drops events before the 13-week window', () => {
    const events = [
      // 200 days ago — way outside
      mkEntry({ timestamp: new Date(2024, 11, 1, 0, 0, 0).toISOString() }),
      // 1 day ago — inside
      mkEntry({ timestamp: new Date(2025, 5, 29, 12, 0, 0).toISOString() }),
    ]
    const out = bucketEvents(events, today)
    const total = out.reduce((sum, b) => sum + b.count, 0)
    expect(total).toBe(1)
  })

  it('drops events after today (clock-skew / future ts)', () => {
    const events = [
      mkEntry({ timestamp: new Date(2025, 6, 15, 0, 0, 0).toISOString() }), // future
      mkEntry({ timestamp: new Date(2025, 5, 30, 0, 0, 0).toISOString() }), // today
    ]
    const out = bucketEvents(events, today)
    const total = out.reduce((sum, b) => sum + b.count, 0)
    expect(total).toBe(1)
  })

  it('produces ISO yyyy-mm-dd date strings in chronological order', () => {
    const out = bucketEvents([], today, 2) // 14 entries
    expect(out[0].date < out[out.length - 1].date).toBe(true)
    // No duplicates.
    const dates = new Set(out.map((b) => b.date))
    expect(dates.size).toBe(out.length)
  })

  it('zero-count buckets still appear in the dense output', () => {
    const out = bucketEvents([], today)
    expect(out.every((b) => b.count === 0)).toBe(true)
  })
})

describe('maxCount', () => {
  it('returns 0 for an empty or all-zero list', () => {
    expect(maxCount([])).toBe(0)
    expect(maxCount([{ date: '2025-01-01', count: 0 }])).toBe(0)
  })

  it('returns the largest count', () => {
    const buckets = [
      { date: '2025-01-01', count: 2 },
      { date: '2025-01-02', count: 9 },
      { date: '2025-01-03', count: 4 },
    ]
    expect(maxCount(buckets)).toBe(9)
  })
})
