import type { SeatHistoryEntry } from '../types/seatHistory'

/**
 * A single tile in the calendar heatmap.
 *
 * `date` is an ISO yyyy-mm-dd string in the viewer's local timezone. `count`
 * is the number of seat-history events that happened on that calendar day.
 */
export interface ChurnBucket {
  date: string
  count: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Zero the time-of-day on a Date (mutates & returns). */
function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** Format a Date as local yyyy-mm-dd. */
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Bucket `events` into a dense `7 * weeks` array of per-day counts ending on
 * `today`. Out-of-window events (before the window start or after today) are
 * ignored — a future-dated event is most likely clock skew, not signal.
 *
 * The output is ascending by date; the last entry is always `today`. Every
 * day in the window appears exactly once, even if its count is zero — the
 * calendar heatmap renders a dense grid and needs the zeros.
 */
export function bucketEvents(
  events: SeatHistoryEntry[],
  today: Date,
  weeks: number = 13,
): ChurnBucket[] {
  const totalDays = 7 * weeks
  const end = startOfDay(today)
  const start = new Date(end.getTime() - (totalDays - 1) * DAY_MS)

  // Pre-seed the dense date list with zero counts, indexed by iso date for
  // O(1) increments during the event scan.
  const buckets: ChurnBucket[] = []
  const byDate = new Map<string, ChurnBucket>()
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start.getTime() + i * DAY_MS)
    const bucket = { date: isoDate(d), count: 0 }
    buckets.push(bucket)
    byDate.set(bucket.date, bucket)
  }

  for (const ev of events) {
    const ts = new Date(ev.timestamp)
    if (Number.isNaN(ts.getTime())) continue
    const key = isoDate(startOfDay(ts))
    const bucket = byDate.get(key)
    if (bucket) bucket.count += 1
  }

  return buckets
}

/**
 * Max count across buckets, used to normalize tile shading. Returns 0 when
 * the list is empty or all-zero; the widget uses that to short-circuit to
 * the empty state.
 */
export function maxCount(buckets: ChurnBucket[]): number {
  let max = 0
  for (const b of buckets) if (b.count > max) max = b.count
  return max
}
