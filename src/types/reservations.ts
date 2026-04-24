/**
 * A day-scoped hot-desk reservation.
 *
 * Reservations layer on top of the permanent-assignment model: they only
 * reference desks that are currently unassigned (`assignedEmployeeId === null`)
 * and non-decommissioned. Each reservation is one employee taking one desk
 * on one date.
 *
 * Reservations live in memory + autosave, not in a dedicated server table —
 * the feature is scoped at "planning artifact" fidelity, not "booking system
 * with notifications". Historical reservations (date < today) are filtered
 * out at read time via `reservationsForDate` + `isStale`.
 */
export interface DeskReservation {
  id: string
  deskElementId: string
  employeeId: string
  /** YYYY-MM-DD in the user's local timezone — date-only, no time component. */
  date: string
  /** ISO timestamp for UI ordering only; never used for date-math. */
  createdAt: string
}
