/**
 * Per-seat status distinct from `Employee.status`. The default (`assigned`
 * vs `unassigned`) is derived from `assignedEmployeeId` / `assignedEmployeeIds`
 * so the common path needs no extra data. `reserved`, `hot-desk`, and
 * `decommissioned` are opt-in overrides the user can set in the Properties
 * panel and persist on the element as `seatStatus`.
 */
export type SeatStatus =
  | 'assigned'
  | 'unassigned'
  | 'reserved'
  | 'hot-desk'
  | 'decommissioned'

export const SEAT_STATUSES: readonly SeatStatus[] = [
  'assigned',
  'unassigned',
  'reserved',
  'hot-desk',
  'decommissioned',
] as const

/**
 * Subset exposed in the Properties-panel dropdown. `assigned` / `unassigned`
 * are derived from the assignment itself — surfacing them as overrides would
 * desync the two sources of truth, so the picker only shows the opt-in
 * overrides plus "none" (clear the override).
 */
export const SEAT_STATUS_OVERRIDES: readonly SeatStatus[] = [
  'reserved',
  'hot-desk',
  'decommissioned',
] as const

export function isSeatStatus(v: unknown): v is SeatStatus {
  return typeof v === 'string' && (SEAT_STATUSES as readonly string[]).includes(v)
}
