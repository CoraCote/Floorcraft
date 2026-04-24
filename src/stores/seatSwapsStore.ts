import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { SeatSwapRequest } from '../types/seatSwaps'
import { useEmployeeStore } from './employeeStore'
import { assignEmployee } from '../lib/seatAssignment'

/**
 * Seat-swap requests store. Not undoable (requests are an append-only
 * record, similar to reservations) and not persisted separately —
 * `useOfficeSync` serializes the list into the office payload.
 *
 * Permission model (enforced at the UI layer, but reflected here via the
 * approverId argument): any logged-in user creates/cancels their own;
 * approve/deny requires `editRoster`.
 *
 * On `approve`, the store performs the actual seat swap by calling
 * `assignEmployee` twice — once for each side of the swap. Because
 * `assignEmployee` evicts single-capacity occupants atomically, the
 * sequence is safe: we assign the requester onto the target's *current*
 * seat first, which evicts the target; then we assign the target onto
 * the requester's *original* seat. Reading the live seat state just
 * before dispatch (rather than trusting the captured `*SeatId` fields)
 * means a reassignment that happened after the request was filed still
 * produces a sensible swap.
 */

export type SeatSwapCreateError =
  | 'requester-unseated'
  | 'target-unseated'
  | 'target-not-found'
  | 'same-employee'

interface SeatSwapsState {
  requests: Record<string, SeatSwapRequest>

  /**
   * File a new swap request. Returns the new id on success or a typed
   * error code when either side of the swap is missing / unseated. The
   * UI layer maps codes to toasts; tests assert on the code directly.
   */
  create: (
    requesterId: string,
    targetEmployeeId: string,
    reason: string,
  ) => { ok: true; id: string } | { ok: false; error: SeatSwapCreateError }

  /**
   * Approve a pending request. Swaps the two employees' seats via
   * `assignEmployee`. Marks the request resolved. No-op if the request
   * is missing or already resolved, or if either side is no longer
   * seated at approval time (rare race — the request is denied
   * implicitly: `status: 'denied'` so it disappears from pending).
   */
  approve: (id: string, approverId: string) => void

  /** Deny a pending request without swapping. */
  deny: (id: string, approverId: string) => void

  /** Cancel one's own pending request. */
  cancel: (id: string) => void

  /** Wholesale replace — used by the office loader on hydrate. */
  setRequests: (next: Record<string, SeatSwapRequest>) => void
}

export const useSeatSwapsStore = create<SeatSwapsState>((set, get) => ({
  requests: {},

  create: (requesterId, targetEmployeeId, reason) => {
    if (requesterId === targetEmployeeId) {
      return { ok: false, error: 'same-employee' }
    }
    const employees = useEmployeeStore.getState().employees
    const requester = employees[requesterId]
    const target = employees[targetEmployeeId]
    if (!target) return { ok: false, error: 'target-not-found' }
    if (!requester || !requester.seatId) {
      return { ok: false, error: 'requester-unseated' }
    }
    if (!target.seatId) return { ok: false, error: 'target-unseated' }

    const id = nanoid()
    const req: SeatSwapRequest = {
      id,
      requesterId,
      requesterSeatId: requester.seatId,
      targetEmployeeId,
      targetSeatId: target.seatId,
      status: 'pending',
      reason,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
    }
    set({ requests: { ...get().requests, [id]: req } })
    return { ok: true, id }
  },

  approve: (id, approverId) => {
    const existing = get().requests[id]
    if (!existing || existing.status !== 'pending') return

    // Read the live seats at approval time. If either side has moved
    // elsewhere, we still swap their *current* positions — the intent
    // is "trade seats with this person", not "restore a frozen layout".
    const employees = useEmployeeStore.getState().employees
    const requester = employees[existing.requesterId]
    const target = employees[existing.targetEmployeeId]
    if (
      !requester ||
      !target ||
      !requester.seatId ||
      !requester.floorId ||
      !target.seatId ||
      !target.floorId
    ) {
      // One side is unseated — mark as denied so the request leaves
      // `pending` and surfaces in the history column with a reason.
      const resolvedAt = new Date().toISOString()
      set({
        requests: {
          ...get().requests,
          [id]: {
            ...existing,
            status: 'denied',
            resolvedAt,
            resolvedBy: approverId,
          },
        },
      })
      return
    }

    // Capture seats/floors before the first write — `assignEmployee`
    // mutates the employee records and would otherwise read back the
    // already-moved requester on the second call.
    const reqSeat = requester.seatId
    const reqFloor = requester.floorId
    const tgtSeat = target.seatId
    const tgtFloor = target.floorId

    // Step 1: move the requester onto the target's seat. For a
    // single-capacity desk this evicts the target (seatId → null).
    assignEmployee(existing.requesterId, tgtSeat, tgtFloor)
    // Step 2: move the target onto the requester's original seat.
    assignEmployee(existing.targetEmployeeId, reqSeat, reqFloor)

    const resolvedAt = new Date().toISOString()
    set({
      requests: {
        ...get().requests,
        [id]: {
          ...existing,
          status: 'approved',
          resolvedAt,
          resolvedBy: approverId,
        },
      },
    })
  },

  deny: (id, approverId) => {
    const existing = get().requests[id]
    if (!existing || existing.status !== 'pending') return
    set({
      requests: {
        ...get().requests,
        [id]: {
          ...existing,
          status: 'denied',
          resolvedAt: new Date().toISOString(),
          resolvedBy: approverId,
        },
      },
    })
  },

  cancel: (id) => {
    const existing = get().requests[id]
    if (!existing || existing.status !== 'pending') return
    set({
      requests: {
        ...get().requests,
        [id]: {
          ...existing,
          status: 'canceled',
          resolvedAt: new Date().toISOString(),
        },
      },
    })
  },

  setRequests: (next) => set({ requests: next }),
}))
