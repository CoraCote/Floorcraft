/**
 * Seat-swap request. An employee asks to swap seats with another assigned
 * employee; a manager/admin (editRoster) approves or denies. Approval
 * performs the actual swap via `assignEmployee` twice from the store.
 *
 * Invariants:
 *   - `requesterSeatId` and `targetSeatId` capture the seats at the time
 *     the request was filed. If either employee moves before the request
 *     is resolved, approve may reassign them onto different desks than
 *     originally captured — that's intentional: the swap is semantic
 *     (these two people swap *current* seats), not a snapshot.
 *   - `status` transitions: pending → approved | denied | canceled.
 *     Once resolved, the request is kept for audit visibility in the
 *     panel's grouped-by-status view.
 */
export type SeatSwapStatus = 'pending' | 'approved' | 'denied' | 'canceled'

export interface SeatSwapRequest {
  id: string
  requesterId: string
  requesterSeatId: string
  targetEmployeeId: string
  targetSeatId: string
  status: SeatSwapStatus
  reason: string
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
}

export const SEAT_SWAP_STATUSES: readonly SeatSwapStatus[] = [
  'pending',
  'approved',
  'denied',
  'canceled',
] as const

export function isSeatSwapStatus(v: unknown): v is SeatSwapStatus {
  return (
    typeof v === 'string' && (SEAT_SWAP_STATUSES as readonly string[]).includes(v)
  )
}
