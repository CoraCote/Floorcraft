/**
 * Meeting-room booking — an hour-range hold on a room element for a
 * specific date. Room elements are the non-assignable space types
 * rendered by `RoomRenderer` (conference rooms, phone booths, common
 * areas); anything the booking UI asks about is gated by
 * `isBookableRoom` in `src/lib/roomBookings.ts`.
 *
 * Bookings layer on top of the canvas model: they don't mutate the
 * element, they sit in a parallel list that `useOfficeSync` serialises
 * into the office payload. Conflict-detection is range-overlap on
 * (elementId, date) — two bookings can share a room on the same date as
 * long as their [startMinutes, endMinutes) windows don't intersect.
 *
 * Scope is intentionally a "planning artifact" — no invites, no
 * notifications, no recurrence. If the product ever grows into a real
 * booking system, `bookedBy` maps 1:1 onto an external-user id and the
 * shape stays stable.
 */
export interface RoomBooking {
  /** Stable id — nanoid, generated in the store at create time. */
  id: string
  /** The CanvasElement id of the room being booked. */
  elementId: string
  /** Floor id the room lives on. Duplicated on the booking so the
   *  sidebar can show the room's floor without having to cross-lookup
   *  the element (and so bookings survive even if the element's floor
   *  lineage changes). */
  floorId: string
  /** YYYY-MM-DD in the user's local timezone — date-only. */
  date: string
  /** Start of the booking window, minutes since midnight (0..1440). */
  startMinutes: number
  /** End of the booking window, minutes since midnight, exclusive
   *  (startMinutes < endMinutes <= 1440). */
  endMinutes: number
  /** The Supabase user id (or equivalent) of the person who booked. */
  bookedBy: string
  /** Display name captured at booking time — cheap redundancy so the
   *  sidebar doesn't need an employee lookup, and so the record reads
   *  sensibly if the user has since been removed from the org. */
  bookedByName: string
  /** Free-form note ("Planning sync"). Optional; may be empty. */
  note: string
  /** ISO timestamp for UI ordering only; never used for date math. */
  createdAt: string
}
