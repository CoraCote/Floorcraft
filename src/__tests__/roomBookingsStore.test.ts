import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomBookingsStore } from '../stores/roomBookingsStore'
import type { CanvasElement } from '../types/elements'

function room(
  id: string,
  type: 'conference-room' | 'phone-booth' | 'common-area' = 'conference-room',
): CanvasElement {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 80,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    roomName: 'Room A',
    areaName: 'Kitchen',
    capacity: 6,
  } as unknown as CanvasElement
}

function desk(id: string): CanvasElement {
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
    assignedEmployeeId: null,
    capacity: 1,
  } as unknown as CanvasElement
}

beforeEach(() => {
  useRoomBookingsStore.setState({ bookings: [] })
})

describe('useRoomBookingsStore', () => {
  it('adds a booking with a generated id', () => {
    const res = useRoomBookingsStore.getState().addBooking({
      element: room('r1'),
      floorId: 'f1',
      date: '2026-04-25',
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      bookedBy: 'u1',
      bookedByName: 'Alice',
      note: 'Planning sync',
    })
    expect(res.ok).toBe(true)
    const list = useRoomBookingsStore.getState().bookings
    expect(list).toHaveLength(1)
    const stored = list[0]
    expect(stored.elementId).toBe('r1')
    expect(stored.floorId).toBe('f1')
    expect(stored.startMinutes).toBe(540)
    expect(stored.endMinutes).toBe(600)
    expect(stored.bookedByName).toBe('Alice')
    expect(stored.note).toBe('Planning sync')
    if (res.ok) expect(stored.id).toBe(res.id)
  })

  it('rejects bookings on non-room elements', () => {
    const res = useRoomBookingsStore.getState().addBooking({
      element: desk('d1'),
      floorId: 'f1',
      date: '2026-04-25',
      startMinutes: 540,
      endMinutes: 600,
      bookedBy: 'u1',
      bookedByName: 'Alice',
      note: '',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('not-a-room')
  })

  it('rejects an invalid range (end <= start)', () => {
    const res = useRoomBookingsStore.getState().addBooking({
      element: room('r1'),
      floorId: 'f1',
      date: '2026-04-25',
      startMinutes: 600,
      endMinutes: 600,
      bookedBy: 'u1',
      bookedByName: 'Alice',
      note: '',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('invalid-range')
  })

  it('removeBooking removes by id and is a no-op on unknown id', () => {
    const r = useRoomBookingsStore.getState().addBooking({
      element: room('r1'),
      floorId: 'f1',
      date: '2026-04-25',
      startMinutes: 540,
      endMinutes: 600,
      bookedBy: 'u1',
      bookedByName: 'Alice',
      note: '',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    useRoomBookingsStore.getState().removeBooking('no-such-id')
    expect(useRoomBookingsStore.getState().bookings).toHaveLength(1)
    useRoomBookingsStore.getState().removeBooking(r.id)
    expect(useRoomBookingsStore.getState().bookings).toHaveLength(0)
  })

  it('getBookingsFor returns only bookings for the (elementId, date) pair, sorted', () => {
    const s = useRoomBookingsStore.getState()
    s.addBooking({
      element: room('r1'),
      floorId: 'f1',
      date: '2026-04-25',
      startMinutes: 14 * 60,
      endMinutes: 15 * 60,
      bookedBy: 'u1',
      bookedByName: 'Alice',
      note: '',
    })
    s.addBooking({
      element: room('r1'),
      floorId: 'f1',
      date: '2026-04-25',
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      bookedBy: 'u2',
      bookedByName: 'Bob',
      note: '',
    })
    s.addBooking({
      element: room('r1'),
      floorId: 'f1',
      date: '2026-04-26',
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      bookedBy: 'u2',
      bookedByName: 'Bob',
      note: '',
    })
    s.addBooking({
      element: room('r2', 'phone-booth'),
      floorId: 'f1',
      date: '2026-04-25',
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      bookedBy: 'u2',
      bookedByName: 'Bob',
      note: '',
    })
    const list = useRoomBookingsStore.getState().getBookingsFor('r1', '2026-04-25')
    expect(list).toHaveLength(2)
    expect(list[0].startMinutes).toBe(540)
    expect(list[1].startMinutes).toBe(840)
  })

  it('setBookings wholesale-replaces the list', () => {
    useRoomBookingsStore.getState().setBookings([
      {
        id: 'x1',
        elementId: 'r1',
        floorId: 'f1',
        date: '2026-04-25',
        startMinutes: 540,
        endMinutes: 600,
        bookedBy: 'u1',
        bookedByName: 'Alice',
        note: '',
        createdAt: new Date().toISOString(),
      },
    ])
    expect(useRoomBookingsStore.getState().bookings).toHaveLength(1)
  })
})
