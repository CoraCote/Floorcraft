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
/**
 * Returns the local calendar date as `yyyy-mm-dd`.
 *
 * Local — not UTC — so a user in UTC-5 planning "effective June 1" gets
 * exactly June 1 as perceived at their wall clock, not May 31 because
 * the Date happens to be an hour before local-midnight in UTC. Used by
 * the effective-dated status-transition commit routine; the 10-char
 * slice output also compares lexicographically, which is how the
 * commit routine decides what's due.
 */
export function todayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear().toString().padStart(4, '0')
  const m = (now.getMonth() + 1).toString().padStart(2, '0')
  const d = now.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

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
