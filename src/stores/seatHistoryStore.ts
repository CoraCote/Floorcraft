import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { SeatHistoryEntry } from '../types/seatHistory'

/**
 * Append-only log of every seat-assignment change. Unlike the map-edit
 * stores this is intentionally NOT wired into zundo: history records
 * *outcomes*, not individual user edits, and the product requirement is
 * that past entries never disappear — even when the underlying map edit
 * is undone. If you undo a re-seat, the history gains a *new* entry for
 * the reversal; the old entry stays.
 *
 * Storage shape is `Record<id, entry>` (not an array) so:
 *   - persistence round-trips are O(1) keyed lookups,
 *   - React's identity check on the whole map still cheaply detects
 *     "entries changed since last render",
 *   - future dedup / id rewrites stay easy.
 *
 * Querying is via helpers that snapshot the map once and return a
 * freshly-sorted array — lists are always desc-by-timestamp so the most
 * recent event is the first row in any UI.
 */
interface SeatHistoryState {
  entries: Record<string, SeatHistoryEntry>

  /**
   * Append ONE entry. Callers pass everything except the synthetic `id`
   * (filled in here with `nanoid()`), so the id is guaranteed unique
   * even when two record calls land in the same microtask. Returns the
   * created entry so tests and the analyzer pipeline can assert on the
   * shape without a second `getState()` round-trip.
   */
  recordAssignment: (entry: Omit<SeatHistoryEntry, 'id'>) => SeatHistoryEntry

  /** Replace the whole log. Used by the office-loader hydration path. */
  setEntries: (entries: Record<string, SeatHistoryEntry>) => void

  /** Wipe the log. Exposed for tests; no UI surfaces this. */
  clear: () => void

  /** Entries for a specific seat id, most-recent-first. */
  entriesForSeat: (seatId: string) => SeatHistoryEntry[]

  /** Entries involving a specific employee (either as assignee or predecessor), most-recent-first. */
  entriesForEmployee: (employeeId: string) => SeatHistoryEntry[]
}

export const useSeatHistoryStore = create<SeatHistoryState>((set, get) => ({
  entries: {},

  recordAssignment: (partial) => {
    const id = nanoid()
    const entry: SeatHistoryEntry = { id, ...partial }
    set((state) => ({ entries: { ...state.entries, [id]: entry } }))
    return entry
  },

  setEntries: (entries) => set({ entries }),

  clear: () => set({ entries: {} }),

  entriesForSeat: (seatId) => {
    const all = Object.values(get().entries)
    return all
      .filter((e) => e.seatId === seatId || e.elementId === seatId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  },

  entriesForEmployee: (employeeId) => {
    const all = Object.values(get().entries)
    return all
      .filter(
        (e) => e.employeeId === employeeId || e.previousEmployeeId === employeeId,
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  },
}))

/**
 * Narrow helper to append a history entry from outside React. Accepts an
 * optional `actorUserId` (defaults to the current `projectStore.currentUserId`
 * snapshot) so call sites in assignment helpers don't have to hand-wire
 * the auth lookup. Returns the created entry.
 *
 * Gated on a module-level re-entry flag so nested calls (e.g. an
 * `assignEmployee` that triggers a `clearEmployeeFromElement` via its
 * legacy reseat path) only log once, at the outermost site.
 */
let recordingDepth = 0

export function withHistoryRecording<T>(fn: () => T): T {
  recordingDepth += 1
  try {
    return fn()
  } finally {
    recordingDepth -= 1
  }
}

export function isOuterRecordingFrame(): boolean {
  // Depth of 1 means we are at the top-level call (the entry to
  // withHistoryRecording); depth 0 means nobody opened a frame, which
  // means the caller isn't inside a reseat cycle at all — still the
  // "outer" frame for our purposes.
  return recordingDepth <= 1
}
