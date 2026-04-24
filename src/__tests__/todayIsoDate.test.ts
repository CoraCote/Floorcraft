import { describe, it, expect } from 'vitest'
import { todayIsoDate } from '../lib/time'

describe('todayIsoDate', () => {
  it('returns yyyy-mm-dd for a fixed Date', () => {
    const d = new Date(2025, 5, 15, 10, 0, 0) // Jun 15 2025 local
    expect(todayIsoDate(d)).toBe('2025-06-15')
  })

  it('pads single-digit month and day', () => {
    const d = new Date(2025, 0, 5, 10, 0, 0)
    expect(todayIsoDate(d)).toBe('2025-01-05')
  })

  it('uses local calendar day, not UTC', () => {
    // 23:55 local on Jun 15 — in any eastern-hemisphere TZ the UTC date
    // would already read Jun 16. We still expect Jun 15 because HR
    // scheduling means "the user's calendar day".
    const d = new Date(2025, 5, 15, 23, 55, 0)
    expect(todayIsoDate(d)).toBe('2025-06-15')
  })

  it('handles midnight transition (00:00 local is the new day)', () => {
    const d = new Date(2025, 5, 16, 0, 0, 1)
    expect(todayIsoDate(d)).toBe('2025-06-16')
  })
})
