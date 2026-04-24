import { describe, it, expect } from 'vitest'
import {
  canCreateBooking,
  rangesOverlap,
  bookingsByRoomForDate,
  formatMinutes,
  isBookableRoom,
} from '../lib/roomBookings'
import type { CanvasElement } from '../types/elements'
import type { RoomBooking } from '../types/roomBookings'

function room(id: string): CanvasElement {
  return {
    id,
    type: 'conference-room',
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
    roomName: 'Room',
    capacity: 6,
  } as unknown as CanvasElement
}

function booking(over: Partial<RoomBooking> = {}): RoomBooking {
  return {
    id: 'b-' + Math.random().toString(36).slice(2, 8),
    elementId: 'r1',
    floorId: 'f1',
    date: '2026-04-25',
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    bookedBy: 'u1',
    bookedByName: 'Alice',
    note: '',
    createdAt: new Date().toISOString(),
    ...over,
  }
}

describe('rangesOverlap', () => {
  it('treats touching edges as non-overlapping', () => {
    expect(rangesOverlap(540, 600, 600, 660)).toBe(false)
    expect(rangesOverlap(600, 660, 540, 600)).toBe(false)
  })

  it('detects partial overlaps', () => {
    expect(rangesOverlap(540, 600, 570, 630)).toBe(true)
    expect(rangesOverlap(570, 630, 540, 600)).toBe(true)
  })

  it('detects containment', () => {
    expect(rangesOverlap(540, 720, 570, 660)).toBe(true)
  })
})

describe('canCreateBooking', () => {
  it('rejects non-room element types', () => {
    const notRoom = { ...room('r1'), type: 'desk' } as unknown as CanvasElement
    expect(canCreateBooking([], notRoom, '2026-04-25', 540, 600)).toBe('not-a-room')
  })

  it('rejects invalid ranges and out-of-bounds minutes', () => {
    expect(canCreateBooking([], room('r1'), '2026-04-25', 600, 540)).toBe('invalid-range')
    expect(canCreateBooking([], room('r1'), '2026-04-25', 600, 600)).toBe('invalid-range')
    expect(canCreateBooking([], room('r1'), '2026-04-25', -10, 60)).toBe('invalid-range')
    expect(canCreateBooking([], room('r1'), '2026-04-25', 0, 1500)).toBe('invalid-range')
  })

  it('allows the first booking on an empty day', () => {
    expect(canCreateBooking([], room('r1'), '2026-04-25', 540, 600)).toBe(null)
  })

  it('flags a conflicting window on the same (room, date)', () => {
    const existing = [booking({ startMinutes: 540, endMinutes: 600 })]
    expect(canCreateBooking(existing, room('r1'), '2026-04-25', 570, 630)).toBe('conflict')
  })

  it('allows back-to-back bookings (touching edges)', () => {
    const existing = [booking({ startMinutes: 540, endMinutes: 600 })]
    expect(canCreateBooking(existing, room('r1'), '2026-04-25', 600, 660)).toBe(null)
  })

  it('ignores bookings for other rooms or other dates', () => {
    const existing = [
      booking({ elementId: 'r2', startMinutes: 540, endMinutes: 600 }),
      booking({ date: '2026-04-24', startMinutes: 540, endMinutes: 600 }),
    ]
    expect(canCreateBooking(existing, room('r1'), '2026-04-25', 540, 600)).toBe(null)
  })
})

describe('bookingsByRoomForDate', () => {
  it('groups by elementId and filters by date, sorting within each group', () => {
    const list = [
      booking({ id: 'a', elementId: 'r1', startMinutes: 780 }),
      booking({ id: 'b', elementId: 'r1', startMinutes: 540 }),
      booking({ id: 'c', elementId: 'r2', startMinutes: 540 }),
      booking({ id: 'd', date: '2026-04-24', startMinutes: 540 }),
    ]
    const grouped = bookingsByRoomForDate(list, '2026-04-25')
    expect(Object.keys(grouped).sort()).toEqual(['r1', 'r2'])
    expect(grouped.r1.map((b) => b.id)).toEqual(['b', 'a'])
  })
})

describe('formatMinutes', () => {
  it('pads with zeros and handles edges', () => {
    expect(formatMinutes(0)).toBe('00:00')
    expect(formatMinutes(9 * 60 + 5)).toBe('09:05')
    expect(formatMinutes(23 * 60 + 59)).toBe('23:59')
  })

  it('returns a placeholder for invalid values', () => {
    expect(formatMinutes(-1)).toBe('--:--')
    expect(formatMinutes(Number.NaN)).toBe('--:--')
    expect(formatMinutes(2000)).toBe('--:--')
  })
})

describe('isBookableRoom', () => {
  it('accepts rooms, common areas, and phone booths; rejects everything else', () => {
    const mk = (type: string) => ({ ...room('r1'), type }) as unknown as CanvasElement
    expect(isBookableRoom(mk('conference-room'))).toBe(true)
    expect(isBookableRoom(mk('phone-booth'))).toBe(true)
    expect(isBookableRoom(mk('common-area'))).toBe(true)
    expect(isBookableRoom(mk('desk'))).toBe(false)
    expect(isBookableRoom(mk('wall'))).toBe(false)
  })
})
