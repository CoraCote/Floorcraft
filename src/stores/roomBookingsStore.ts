import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { CanvasElement } from '../types/elements'
import type { RoomBooking } from '../types/roomBookings'
import {
  canCreateBooking,
  bookingsFor as pureBookingsFor,
  type BookingError,
} from '../lib/roomBookings'

/**
 * Meeting-room bookings store. Mirrors `reservationsStore`: not undoable
 * (the list is a chronological log, not a canvas mutation) and not
 * persisted separately — `useOfficeSync` serialises the list into the
 * office payload and `ProjectShell` rehydrates it on load. Rules live in
 * `src/lib/roomBookings.ts` so they can be unit-tested without React.
 */

export interface AddBookingInput {
  element: CanvasElement
  floorId: string
  date: string
  startMinutes: number
  endMinutes: number
  bookedBy: string
  bookedByName: string
  note: string
}

interface RoomBookingsState {
  bookings: RoomBooking[]

  /**
   * Attempt to add a booking. Returns the new id on success or a typed
   * error tag on failure (the caller's toast layer maps tags to
   * human-readable messages so one source of truth governs each rule).
   */
  addBooking: (
    input: AddBookingInput,
  ) => { ok: true; id: string } | { ok: false; error: BookingError }

  /** Remove a booking by id. No-op if it doesn't exist. */
  removeBooking: (id: string) => void

  /** Bulk replace — used by autosave/load. Callers pass an already-migrated list. */
  setBookings: (list: RoomBooking[]) => void

  /** Read-through to the pure helper so components can stay terse. */
  getBookingsFor: (elementId: string, date: string) => RoomBooking[]
}

export const useRoomBookingsStore = create<RoomBookingsState>((set, get) => ({
  bookings: [],

  addBooking: (input) => {
    const list = get().bookings
    const err = canCreateBooking(
      list,
      input.element,
      input.date,
      input.startMinutes,
      input.endMinutes,
    )
    if (err !== null) return { ok: false, error: err }
    const id = nanoid()
    const booking: RoomBooking = {
      id,
      elementId: input.element.id,
      floorId: input.floorId,
      date: input.date,
      startMinutes: input.startMinutes,
      endMinutes: input.endMinutes,
      bookedBy: input.bookedBy,
      bookedByName: input.bookedByName,
      note: input.note,
      createdAt: new Date().toISOString(),
    }
    set({ bookings: [...list, booking] })
    return { ok: true, id }
  },

  removeBooking: (id) => {
    const list = get().bookings
    const next = list.filter((b) => b.id !== id)
    if (next.length === list.length) return
    set({ bookings: next })
  },

  setBookings: (list) => set({ bookings: list }),

  getBookingsFor: (elementId, date) =>
    pureBookingsFor(get().bookings, elementId, date),
}))
