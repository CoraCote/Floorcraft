import { describe, it, expect, beforeEach } from 'vitest'
import { coerceSeatHistoryEntries } from '../lib/offices/seatHistoryPersistence'
import { useSeatHistoryStore } from '../stores/seatHistoryStore'
import type { SeatHistoryEntry } from '../types/seatHistory'

const SAMPLE: SeatHistoryEntry = {
  id: 'hist-1',
  seatId: 'd1',
  elementId: 'd1',
  employeeId: 'alice',
  previousEmployeeId: null,
  action: 'assign',
  timestamp: '2024-04-10T10:23:00Z',
  actorUserId: 'u-1',
  note: null,
}

beforeEach(() => {
  useSeatHistoryStore.getState().clear()
})

describe('seatHistoryPersistence', () => {
  it('round-trips a Record-keyed payload through coerce', () => {
    const input: Record<string, SeatHistoryEntry> = { [SAMPLE.id]: SAMPLE }
    const out = coerceSeatHistoryEntries(input)
    expect(out[SAMPLE.id]).toEqual(SAMPLE)
  })

  it('round-trips through the store and coercer end-to-end', () => {
    useSeatHistoryStore.getState().recordAssignment({
      seatId: 'd1', elementId: 'd1', employeeId: 'alice', previousEmployeeId: null,
      action: 'assign', timestamp: '2024-04-10T10:23:00Z', actorUserId: null, note: null,
    })
    // Serialize and re-hydrate — simulates save/load cycle.
    const snapshot = useSeatHistoryStore.getState().entries
    const serialized = JSON.stringify(snapshot)
    const parsed = JSON.parse(serialized) as unknown
    const coerced = coerceSeatHistoryEntries(parsed)

    useSeatHistoryStore.getState().clear()
    useSeatHistoryStore.setState({ entries: coerced })

    const rows = useSeatHistoryStore.getState().entriesForSeat('d1')
    expect(rows).toHaveLength(1)
    expect(rows[0].employeeId).toBe('alice')
  })

  it('coerces bare array payloads into a keyed Record', () => {
    const out = coerceSeatHistoryEntries([SAMPLE])
    expect(Object.keys(out)).toEqual([SAMPLE.id])
    expect(out[SAMPLE.id].action).toBe('assign')
  })

  it('drops malformed entries without taking down the whole payload', () => {
    const mixed = {
      good: SAMPLE,
      bad1: { id: 'x', elementId: 'd1' }, // missing timestamp + action
      bad2: 'not-an-object',
      bad3: { ...SAMPLE, id: '', action: 'assign' }, // empty id rejected
    }
    const out = coerceSeatHistoryEntries(mixed)
    expect(Object.keys(out)).toEqual([SAMPLE.id])
  })

  it('returns an empty map for non-object / null / undefined inputs', () => {
    expect(coerceSeatHistoryEntries(null)).toEqual({})
    expect(coerceSeatHistoryEntries(undefined)).toEqual({})
    expect(coerceSeatHistoryEntries('oops')).toEqual({})
    expect(coerceSeatHistoryEntries(42)).toEqual({})
  })

  it('coerces unknown action strings to null (entry dropped)', () => {
    const bad = { ...SAMPLE, action: 'teleport' as unknown }
    const out = coerceSeatHistoryEntries({ x: bad })
    expect(Object.keys(out)).toHaveLength(0)
  })
})
