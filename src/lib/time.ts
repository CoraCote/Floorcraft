/**
 * Turn an ISO timestamp into a compact "time-ago" label for UI indicators.
 *
 * Returns:
 *   null            → input is missing / unparseable (caller shows nothing)
 *   'just now'      → < 5 seconds ago
 *   '12s ago'       → < 1 minute
 *   '5m ago'        → < 1 hour
 *   '3h ago'        → < 1 day
 *   '2d ago'        → everything older
 *
 * Deliberately no dependency on `date-fns` — this is the only thing we need
 * it for and the bundle already carries enough chart/drawing code.
 */
export function formatRelative(iso: string | null, now: number = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  // Clock skew between a persisted autosave and the current machine can make
  // `t` slightly greater than `now`. We clamp to 0 so a future timestamp
  // reports "just now" instead of something nonsensical like "-3s ago".
  const seconds = Math.max(0, Math.floor((now - t) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
