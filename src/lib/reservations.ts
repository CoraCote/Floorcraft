import type { CanvasElement, DeskElement } from '../types/elements'
import { isDeskElement } from '../types/elements'
import type { DeskReservation } from '../types/reservations'

/**
 * Pure helpers for the reservation model. Keep this file dependency-free
 * (types only) — the store, the canvas overlay, and the reservations page
 * all import from here, and keeping it pure means tests can exercise the
 * rules without mounting React or Zustand.
 */

/**
 * Today's date in YYYY-MM-DD, local timezone. Split out so tests can feed
 * a fixed "today" via `isStale(res, '2026-04-24')` without timezone drama.
 */
export function todayIso(now: Date = new Date()): string {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * A desk can host a reservation if it's an unassigned, non-decommissioned
 * `DeskElement`. Workstations + private offices are multi-seat and out of
 * scope for the MVP — if we extend later, the store's uniqueness guard
 * needs to be rewritten from (deskId, date) to (deskId, seatIndex, date).
 */
export function canReserveDesk(el: CanvasElement): el is DeskElement {
  if (!isDeskElement(el)) return false
  if (el.assignedEmployeeId !== null) return false
  if (el.seatStatus === 'decommissioned') return false
  return true
}

/**
 * Stale = the reservation's date is strictly before today. Display layers
 * hide stale reservations but the store keeps them around until refresh —
 * we don't want to mutate store state as a side-effect of reading it.
 */
export function isStale(res: DeskReservation, today: string): boolean {
  return res.date < today
}

/**
 * Return the active reservations for a given date keyed by desk id, so a
 * Konva layer can look up "what's reserved on this desk today?" in O(1).
 * Multiple reservations on the same (desk, date) would be a bug — the
 * store rejects them — but defensively we keep the last one encountered.
 */
export function reservationsForDate(
  list: DeskReservation[],
  date: string,
): Record<string, DeskReservation> {
  const out: Record<string, DeskReservation> = {}
  for (const r of list) {
    if (r.date !== date) continue
    out[r.deskElementId] = r
  }
  return out
}

/**
 * Quick index for "is this employee already booked on `date`?". Used by
 * the store to enforce the one-reservation-per-employee-per-day rule.
 */
export function employeeReservationsByDate(
  list: DeskReservation[],
): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {}
  for (const r of list) {
    if (!out[r.employeeId]) out[r.employeeId] = new Set()
    out[r.employeeId].add(r.date)
  }
  return out
}

/**
 * Reservation creation errors — returned as a discriminated tag rather than
 * a boolean so the toast layer can render a specific, friendly message.
 */
export type ReservationError =
  | 'desk-not-reservable'
  | 'desk-already-reserved'
  | 'employee-already-booked'

export function canCreateReservation(
  list: DeskReservation[],
  desk: CanvasElement,
  employeeId: string,
  date: string,
): ReservationError | null {
  if (!canReserveDesk(desk)) return 'desk-not-reservable'
  for (const r of list) {
    if (r.date !== date) continue
    if (r.deskElementId === desk.id) return 'desk-already-reserved'
    if (r.employeeId === employeeId) return 'employee-already-booked'
  }
  return null
}
