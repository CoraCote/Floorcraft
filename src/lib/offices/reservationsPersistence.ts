import type { DeskReservation } from '../../types/reservations'

/**
 * Coerce a raw `reservations` payload value into a `DeskReservation[]`.
 * Accepts the expected array shape, a keyed Record (defensive, not emitted
 * anywhere today), or anything else → empty array. Drops individual
 * entries that fail per-field shape checks so a single corrupt row can't
 * crash the reservations page on load.
 *
 * Legacy payloads (before the feature shipped) simply have no such key —
 * the caller reads `p.reservations` and passes `undefined`, which we
 * normalise to `[]`.
 */
export function coerceReservations(raw: unknown): DeskReservation[] {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) {
    const out: DeskReservation[] = []
    for (const item of raw) {
      const e = coerceOne(item)
      if (e) out.push(e)
    }
    return out
  }
  if (typeof raw === 'object') {
    const out: DeskReservation[] = []
    for (const v of Object.values(raw as Record<string, unknown>)) {
      const e = coerceOne(v)
      if (e) out.push(e)
    }
    return out
  }
  return []
}

function coerceOne(raw: unknown): DeskReservation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return null
  if (typeof r.deskElementId !== 'string' || !r.deskElementId) return null
  if (typeof r.employeeId !== 'string' || !r.employeeId) return null
  if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()
  return {
    id: r.id,
    deskElementId: r.deskElementId,
    employeeId: r.employeeId,
    date: r.date,
    createdAt,
  }
}
