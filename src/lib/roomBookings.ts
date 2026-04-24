import type { CanvasElement } from '../types/elements'
import type { RoomBooking } from '../types/roomBookings'

/**
 * Pure helpers for the room-booking model. Kept dependency-free (types
 * only) so the store, the canvas overlay, and the tests can share the
 * same rules without mounting React or Zustand.
 */

/**
 * Today's date in YYYY-MM-DD, local timezone. Split out so tests can
 * pin a fixed "today" without timezone drama.
 */
export function todayIso(now: Date = new Date()): string {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Room-like element types — conference rooms, phone booths, and common
 * areas. These are the exact types `RoomRenderer` handles, so the
 * booking UI lines up with the visual affordance users already see.
 * Kept as a closed list rather than a boolean on the element so the
 * discriminator stays in the type union (no migration needed).
 */
export function isBookableRoom(el: CanvasElement): boolean {
  return (
    el.type === 'conference-room' ||
    el.type === 'phone-booth' ||
    el.type === 'common-area'
  )
}

/**
 * Half-open interval overlap: [aStart, aEnd) intersects [bStart, bEnd).
 * Touching edges (e.g. 9:00-10:00 and 10:00-11:00) are treated as
 * non-overlapping so back-to-back meetings can share a room.
 */
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * Booking-creation errors — discriminated tags so the toast layer can
 * render a specific, friendly message without parsing booleans.
 */
export type BookingError =
  | 'invalid-range'
  | 'not-a-room'
  | 'conflict'

/**
 * Validate a would-be booking against the existing list. Returns the
 * error tag on failure, or null on success.
 *
 *   - `invalid-range`: start >= end, or either bound is outside
 *     [0, 1440].
 *   - `not-a-room`: the element isn't a bookable room type.
 *   - `conflict`: another booking on the same (elementId, date) already
 *     covers any part of the proposed window.
 */
export function canCreateBooking(
  list: RoomBooking[],
  element: CanvasElement,
  date: string,
  startMinutes: number,
  endMinutes: number,
): BookingError | null {
  if (!isBookableRoom(element)) return 'not-a-room'
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes))
    return 'invalid-range'
  if (startMinutes < 0 || endMinutes > 1440) return 'invalid-range'
  if (startMinutes >= endMinutes) return 'invalid-range'
  for (const b of list) {
    if (b.elementId !== element.id) continue
    if (b.date !== date) continue
    if (rangesOverlap(startMinutes, endMinutes, b.startMinutes, b.endMinutes))
      return 'conflict'
  }
  return null
}

/**
 * Bookings for a specific (elementId, date), sorted ascending by
 * startMinutes. Sort is stable because JS Array.prototype.sort is
 * stable since ES2019.
 */
export function bookingsFor(
  list: RoomBooking[],
  elementId: string,
  date: string,
): RoomBooking[] {
  return list
    .filter((b) => b.elementId === elementId && b.date === date)
    .sort((a, b) => a.startMinutes - b.startMinutes)
}

/**
 * Bookings on a given date across all rooms, grouped by elementId.
 * Used by the sidebar panel to render today's activity without having
 * to scan the full list per row.
 */
export function bookingsByRoomForDate(
  list: RoomBooking[],
  date: string,
): Record<string, RoomBooking[]> {
  const out: Record<string, RoomBooking[]> = {}
  for (const b of list) {
    if (b.date !== date) continue
    if (!out[b.elementId]) out[b.elementId] = []
    out[b.elementId].push(b)
  }
  for (const id of Object.keys(out)) {
    out[id].sort((a, b) => a.startMinutes - b.startMinutes)
  }
  return out
}

/**
 * Format a "minutes since midnight" value as HH:MM (24-hour). Used by
 * the sidebar rows and the booking dialog readout. Invalid inputs
 * fall through to "--:--" so a corrupt record can't crash the panel.
 */
export function formatMinutes(m: number): string {
  if (!Number.isFinite(m) || m < 0 || m > 1440) return '--:--'
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
