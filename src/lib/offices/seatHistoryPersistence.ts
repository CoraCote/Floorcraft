import type { SeatHistoryAction, SeatHistoryEntry } from '../../types/seatHistory'

const VALID_ACTIONS: SeatHistoryAction[] = ['assign', 'unassign', 'reassign']

/**
 * Coerce whatever the payload holds under `seatHistory` into a valid
 * `Record<string, SeatHistoryEntry>`. Accepts the expected keyed-Record
 * shape, a bare array of entries (used by older dev fixtures), or any
 * non-object → empty map. Drops any individual entry that fails the
 * per-field shape check so a single corrupted row can't take down the
 * rest of the log.
 */
export function coerceSeatHistoryEntries(raw: unknown): Record<string, SeatHistoryEntry> {
  if (!raw) return {}
  if (typeof raw !== 'object') return {}

  const out: Record<string, SeatHistoryEntry> = {}

  // Array form: use the entry's own `id` as the key. Anything without a
  // usable id is discarded — we refuse to synthesise ids at load time
  // because that would destabilise references stored elsewhere.
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const entry = coerceEntry(item)
      if (entry) out[entry.id] = entry
    }
    return out
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = coerceEntry(value)
    if (!entry) continue
    // Prefer the object's own id; fall back to the keyed id only if the
    // entry's id was dropped (shouldn't happen — `coerceEntry` returns
    // null when no id — but defensive).
    out[entry.id || key] = { ...entry, id: entry.id || key }
  }
  return out
}

function coerceEntry(raw: unknown): SeatHistoryEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return null
  if (typeof r.elementId !== 'string' || !r.elementId) return null
  if (typeof r.timestamp !== 'string' || !r.timestamp) return null
  const action =
    typeof r.action === 'string' && (VALID_ACTIONS as string[]).includes(r.action)
      ? (r.action as SeatHistoryAction)
      : null
  if (!action) return null

  const seatId = typeof r.seatId === 'string' && r.seatId ? r.seatId : r.elementId
  const employeeId = typeof r.employeeId === 'string' ? r.employeeId : null
  const previousEmployeeId =
    typeof r.previousEmployeeId === 'string' ? r.previousEmployeeId : null
  const actorUserId = typeof r.actorUserId === 'string' ? r.actorUserId : null
  const note = typeof r.note === 'string' ? r.note : null

  return {
    id: r.id,
    seatId,
    elementId: r.elementId,
    employeeId,
    previousEmployeeId,
    action,
    timestamp: r.timestamp,
    actorUserId,
    note,
  }
}
