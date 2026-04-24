/**
 * Append-only seat-assignment audit trail.
 *
 * Every call to the assignment helpers (`assignEmployee`,
 * `unassignEmployee`) emits one `SeatHistoryEntry` summarising the before
 * → after state. History is never mutated after write — the drawer/
 * analyzer only ever reads. Callers that care about undoing an edit
 * should use the `zundo` temporal store on `elementsStore`; the history
 * log records outcomes, not intermediate undo frames.
 */
export type SeatHistoryAction = 'assign' | 'unassign' | 'reassign'

export interface SeatHistoryEntry {
  /** nanoid — unique per entry, stable across reloads. */
  id: string
  /**
   * The seat identifier the user would recognise — for single-capacity
   * desks this equals `elementId`; for multi-capacity workstations/
   * private-offices it's the element id as well (per-slot position keys
   * are future work, so today the two columns agree). Stored separately
   * so a future schema can diverge without breaking existing entries.
   */
  seatId: string
  /** The canvas element id. Always set. */
  elementId: string
  /** The new assignee. `null` means the seat was just vacated. */
  employeeId: string | null
  /** The previous assignee (pre-edit), for reassignment readouts. */
  previousEmployeeId: string | null
  action: SeatHistoryAction
  /** ISO-8601. Source of truth for the timeline ordering. */
  timestamp: string
  /**
   * The Supabase user id of the person who made the edit, or `null` for
   * system/migration-origin entries (e.g. CSV import with no session,
   * seeded demo data).
   */
  actorUserId: string | null
  /** Optional free-text reason — not surfaced in the default UI. */
  note: string | null
}
