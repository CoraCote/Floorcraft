import { describe, it, expect, beforeEach } from 'vitest'
import { useReservationsStore } from '../stores/reservationsStore'
import type { CanvasElement } from '../types/elements'
import type { SeatStatus } from '../types/seatAssignment'

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

beforeEach(() => {
  useReservationsStore.setState({ reservations: [] })
})

describe('useReservationsStore', () => {
  it('creates a reservation with a generated id and returns it', () => {
    const res = useReservationsStore.getState().create(desk('d1'), 'e1', '2026-04-25')
    expect(res.ok).toBe(true)
    const state = useReservationsStore.getState()
    expect(state.reservations).toHaveLength(1)
    const stored = state.reservations[0]
    expect(stored.deskElementId).toBe('d1')
    expect(stored.employeeId).toBe('e1')
    expect(stored.date).toBe('2026-04-25')
    if (res.ok) expect(stored.id).toBe(res.id)
  })

  it('rejects a duplicate desk+date reservation with the right error tag', () => {
    useReservationsStore.getState().create(desk('d1'), 'e1', '2026-04-25')
    const r2 = useReservationsStore.getState().create(desk('d1'), 'e2', '2026-04-25')
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toBe('desk-already-reserved')
    expect(useReservationsStore.getState().reservations).toHaveLength(1)
  })

  it('rejects a duplicate employee+date reservation', () => {
    useReservationsStore.getState().create(desk('d1'), 'e1', '2026-04-25')
    const r2 = useReservationsStore.getState().create(desk('d2'), 'e1', '2026-04-25')
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toBe('employee-already-booked')
  })

  it('rejects reservations on non-reservable desks', () => {
    const r = useReservationsStore
      .getState()
      .create(desk('d1', 'e-other'), 'e1', '2026-04-25')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('desk-not-reservable')
  })

  it('cancel removes the reservation by id', () => {
    const r = useReservationsStore.getState().create(desk('d1'), 'e1', '2026-04-25')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    useReservationsStore.getState().cancel(r.id)
    expect(useReservationsStore.getState().reservations).toHaveLength(0)
  })

  it('cancel is a no-op for an unknown id', () => {
    useReservationsStore.getState().create(desk('d1'), 'e1', '2026-04-25')
    useReservationsStore.getState().cancel('no-such-id')
    expect(useReservationsStore.getState().reservations).toHaveLength(1)
  })

  it('reservationsForDate returns only matches for the given date', () => {
    useReservationsStore.getState().create(desk('d1'), 'e1', '2026-04-25')
    useReservationsStore.getState().create(desk('d2'), 'e2', '2026-04-26')
    const m = useReservationsStore.getState().reservationsForDate('2026-04-25')
    expect(Object.keys(m)).toEqual(['d1'])
  })

  it('setReservations replaces the list wholesale', () => {
    useReservationsStore.getState().setReservations([
      {
        id: 'x1',
        deskElementId: 'd1',
        employeeId: 'e1',
        date: '2026-04-25',
        createdAt: new Date().toISOString(),
      },
    ])
    expect(useReservationsStore.getState().reservations).toHaveLength(1)
  })
})
