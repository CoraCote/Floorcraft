import type { RoomBooking } from '../../types/roomBookings'

/**
 * Coerce a raw `roomBookings` payload value into a `RoomBooking[]`.
 * Accepts the expected array shape, a keyed Record (defensive, not
 * emitted anywhere today), or anything else → empty array. Drops
 * individual entries that fail per-field shape checks so a single
 * corrupt row can't crash the editor on load.
 *
 * Legacy payloads (before the feature shipped) simply have no such key
 * — the caller reads `p.roomBookings` and passes `undefined`, which we
 * normalise to `[]`.
 */
export function coerceRoomBookings(raw: unknown): RoomBooking[] {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) {
    const out: RoomBooking[] = []
    for (const item of raw) {
      const e = coerceOne(item)
      if (e) out.push(e)
    }
    return out
  }
  if (typeof raw === 'object') {
    const out: RoomBooking[] = []
    for (const v of Object.values(raw as Record<string, unknown>)) {
      const e = coerceOne(v)
      if (e) out.push(e)
    }
    return out
  }
  return []
}

function coerceOne(raw: unknown): RoomBooking | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return null
  if (typeof r.elementId !== 'string' || !r.elementId) return null
  if (typeof r.floorId !== 'string' || !r.floorId) return null
  if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date))
    return null
  if (typeof r.startMinutes !== 'number' || !Number.isFinite(r.startMinutes))
    return null
  if (typeof r.endMinutes !== 'number' || !Number.isFinite(r.endMinutes))
    return null
  if (r.startMinutes < 0 || r.endMinutes > 1440) return null
  if (r.startMinutes >= r.endMinutes) return null
  if (typeof r.bookedBy !== 'string' || !r.bookedBy) return null
  const bookedByName = typeof r.bookedByName === 'string' ? r.bookedByName : ''
  const note = typeof r.note === 'string' ? r.note : ''
  const createdAt =
    typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()
  return {
    id: r.id,
    elementId: r.elementId,
    floorId: r.floorId,
    date: r.date,
    startMinutes: r.startMinutes,
    endMinutes: r.endMinutes,
    bookedBy: r.bookedBy,
    bookedByName,
    note,
    createdAt,
  }
}
