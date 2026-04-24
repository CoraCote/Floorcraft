import { describe, it, expect } from 'vitest'
import {
  analyzeSeatChurnFromEntries,
  CHURN_REASSIGN_THRESHOLD,
} from '../lib/analyzers/seatChurn'
import type { SeatHistoryEntry } from '../types/seatHistory'
import type { DeskElement } from '../types/elements'

function desk(id: string, deskId = `D-${id}`): DeskElement {
  return {
    id, type: 'desk',
    x: 0, y: 0, width: 72, height: 48, rotation: 0,
    locked: false, groupId: null, zIndex: 1, label: '', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId,
    assignedEmployeeId: null,
    capacity: 1,
  }
}

function reassign(
  elementId: string,
  daysAgo: number,
  now: number,
): SeatHistoryEntry {
  return {
    id: `h-${elementId}-${daysAgo}`,
    seatId: elementId,
    elementId,
    employeeId: `new-${daysAgo}`,
    previousEmployeeId: `old-${daysAgo}`,
    action: 'reassign',
    timestamp: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    actorUserId: null,
    note: null,
  }
}

describe('analyzeSeatChurn', () => {
  const NOW = new Date('2024-06-01T00:00:00Z').getTime()

  it('emits no insights below the reassignment threshold', () => {
    const entries = [
      reassign('d1', 1, NOW),
      reassign('d1', 2, NOW),
    ]
    const result = analyzeSeatChurnFromEntries(
      { elements: [desk('d1')], employees: [], zones: new Map() },
      entries,
      NOW,
    )
    expect(result).toHaveLength(0)
  })

  it('emits a warning once a seat reaches the threshold within 30d', () => {
    const entries = Array.from({ length: CHURN_REASSIGN_THRESHOLD }, (_, i) =>
      reassign('d1', i + 1, NOW),
    )
    const result = analyzeSeatChurnFromEntries(
      { elements: [desk('d1', 'D-42')], employees: [], zones: new Map() },
      entries,
      NOW,
    )
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('warning')
    expect(result[0].title).toContain('D-42')
    expect(result[0].title).toMatch(/3/)
  })

  it('ignores entries older than the 30-day window', () => {
    const entries = [
      reassign('d1', 1, NOW),
      reassign('d1', 2, NOW),
      // 60 days old → outside the window, doesn't count.
      reassign('d1', 60, NOW),
    ]
    const result = analyzeSeatChurnFromEntries(
      { elements: [desk('d1')], employees: [], zones: new Map() },
      entries,
      NOW,
    )
    expect(result).toHaveLength(0)
  })

  it('only counts reassigns — plain assigns/unassigns do not contribute', () => {
    const base = reassign('d1', 1, NOW)
    const entries: SeatHistoryEntry[] = [
      base,
      { ...base, id: 'x2', action: 'assign' },
      { ...base, id: 'x3', action: 'unassign' },
      { ...base, id: 'x4', action: 'assign' },
    ]
    const result = analyzeSeatChurnFromEntries(
      { elements: [desk('d1')], employees: [], zones: new Map() },
      entries,
      NOW,
    )
    // Only one "reassign" — below threshold.
    expect(result).toHaveLength(0)
  })

  it('emits per-seat insights for multiple hot desks', () => {
    const entries = [
      ...Array.from({ length: 3 }, (_, i) => reassign('d1', i + 1, NOW)),
      ...Array.from({ length: 3 }, (_, i) => reassign('d2', i + 1, NOW)),
    ]
    const result = analyzeSeatChurnFromEntries(
      { elements: [desk('d1'), desk('d2')], employees: [], zones: new Map() },
      entries,
      NOW,
    )
    expect(result).toHaveLength(2)
    const ids = result.map((r) => r.id).sort()
    expect(ids).toEqual(['seat-churn-d1', 'seat-churn-d2'])
  })
})
