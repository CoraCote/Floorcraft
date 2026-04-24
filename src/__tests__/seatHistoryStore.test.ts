import { describe, it, expect, beforeEach } from 'vitest'
import { useSeatHistoryStore } from '../stores/seatHistoryStore'

/**
 * The store itself is pure (no side effects outside zustand's setState),
 * so the tests just exercise the four public observable behaviors: append,
 * query-by-seat, query-by-employee, and sort order.
 */
describe('seatHistoryStore', () => {
  beforeEach(() => {
    useSeatHistoryStore.getState().clear()
  })

  it('appends a new entry and returns the created record', () => {
    const entry = useSeatHistoryStore.getState().recordAssignment({
      seatId: 's1',
      elementId: 's1',
      employeeId: 'e1',
      previousEmployeeId: null,
      action: 'assign',
      timestamp: '2024-01-01T00:00:00Z',
      actorUserId: 'u1',
      note: null,
    })
    expect(entry.id).toBeTruthy()
    const all = useSeatHistoryStore.getState().entries
    expect(Object.keys(all)).toHaveLength(1)
    expect(all[entry.id].employeeId).toBe('e1')
  })

  it('queries by seat id and returns entries sorted desc by timestamp', () => {
    const s = useSeatHistoryStore.getState()
    s.recordAssignment({
      seatId: 's1', elementId: 's1', employeeId: 'alice', previousEmployeeId: null,
      action: 'assign', timestamp: '2024-01-01T00:00:00Z', actorUserId: null, note: null,
    })
    s.recordAssignment({
      seatId: 's1', elementId: 's1', employeeId: 'bob', previousEmployeeId: 'alice',
      action: 'reassign', timestamp: '2024-02-01T00:00:00Z', actorUserId: null, note: null,
    })
    s.recordAssignment({
      seatId: 's2', elementId: 's2', employeeId: 'carol', previousEmployeeId: null,
      action: 'assign', timestamp: '2024-01-15T00:00:00Z', actorUserId: null, note: null,
    })
    const rows = useSeatHistoryStore.getState().entriesForSeat('s1')
    expect(rows).toHaveLength(2)
    // Most-recent first.
    expect(rows[0].employeeId).toBe('bob')
    expect(rows[1].employeeId).toBe('alice')
  })

  it('queries by employee id — includes both new-assignee and predecessor roles', () => {
    const s = useSeatHistoryStore.getState()
    s.recordAssignment({
      seatId: 's1', elementId: 's1', employeeId: 'alice', previousEmployeeId: null,
      action: 'assign', timestamp: '2024-01-01T00:00:00Z', actorUserId: null, note: null,
    })
    s.recordAssignment({
      seatId: 's1', elementId: 's1', employeeId: 'bob', previousEmployeeId: 'alice',
      action: 'reassign', timestamp: '2024-02-01T00:00:00Z', actorUserId: null, note: null,
    })
    s.recordAssignment({
      seatId: 's2', elementId: 's2', employeeId: null, previousEmployeeId: 'dave',
      action: 'unassign', timestamp: '2024-03-01T00:00:00Z', actorUserId: null, note: null,
    })
    const aliceRows = useSeatHistoryStore.getState().entriesForEmployee('alice')
    // Alice shows up as assignee in entry 1 and as predecessor in entry 2.
    expect(aliceRows.map((r) => r.action)).toEqual(['reassign', 'assign'])

    const daveRows = useSeatHistoryStore.getState().entriesForEmployee('dave')
    expect(daveRows).toHaveLength(1)
    expect(daveRows[0].action).toBe('unassign')
  })

  it('clear() empties the store', () => {
    const s = useSeatHistoryStore.getState()
    s.recordAssignment({
      seatId: 's1', elementId: 's1', employeeId: 'e1', previousEmployeeId: null,
      action: 'assign', timestamp: '2024-01-01T00:00:00Z', actorUserId: null, note: null,
    })
    s.clear()
    expect(Object.keys(useSeatHistoryStore.getState().entries)).toHaveLength(0)
  })

  it('generates unique ids when two appends land in the same microtask', () => {
    const s = useSeatHistoryStore.getState()
    const a = s.recordAssignment({
      seatId: 's1', elementId: 's1', employeeId: 'e1', previousEmployeeId: null,
      action: 'assign', timestamp: '2024-01-01T00:00:00Z', actorUserId: null, note: null,
    })
    const b = s.recordAssignment({
      seatId: 's1', elementId: 's1', employeeId: null, previousEmployeeId: 'e1',
      action: 'unassign', timestamp: '2024-01-01T00:00:00Z', actorUserId: null, note: null,
    })
    expect(a.id).not.toBe(b.id)
  })
})
