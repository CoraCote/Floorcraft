import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { CanvasElement } from '../types/elements'
import type { DeskReservation } from '../types/reservations'
import {
  canCreateReservation,
  reservationsForDate as pureReservationsForDate,
  type ReservationError,
} from '../lib/reservations'

/**
 * Hot-desk reservations store. Not undoable (reservations are a chronological
 * log, not a canvas mutation) and not persisted separately — `useAutoSave`
 * serializes the list into the office payload. CRUD is terse on purpose:
 * the real rules live in `src/lib/reservations.ts` so they can be unit-tested
 * in isolation.
 */

interface ReservationsState {
  reservations: DeskReservation[]

  /**
   * Attempt to create a reservation. Returns the new id on success or a
   * typed error string on failure (the caller's toast layer maps the code
   * to a human message so one source of truth governs each rule).
   */
  create: (
    desk: CanvasElement,
    employeeId: string,
    date: string,
  ) => { ok: true; id: string } | { ok: false; error: ReservationError }

  /** Delete a reservation by id. No-op if it doesn't exist. */
  cancel: (id: string) => void

  /** Bulk replace — used by autosave/load. Callers should pass an already-migrated list. */
  setReservations: (list: DeskReservation[]) => void

  /** Read-through to the pure helper for ergonomics at the React layer. */
  reservationsForDate: (date: string) => Record<string, DeskReservation>
}

export const useReservationsStore = create<ReservationsState>((set, get) => ({
  reservations: [],

  create: (desk, employeeId, date) => {
    const list = get().reservations
    const err = canCreateReservation(list, desk, employeeId, date)
    if (err !== null) return { ok: false, error: err }
    const id = nanoid()
    const res: DeskReservation = {
      id,
      deskElementId: desk.id,
      employeeId,
      date,
      createdAt: new Date().toISOString(),
    }
    set({ reservations: [...list, res] })
    return { ok: true, id }
  },

  cancel: (id) => {
    const list = get().reservations
    const next = list.filter((r) => r.id !== id)
    if (next.length === list.length) return
    set({ reservations: next })
  },

  setReservations: (list) => set({ reservations: list }),

  reservationsForDate: (date) => pureReservationsForDate(get().reservations, date),
}))
