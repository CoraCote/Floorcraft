import type { SeatHistoryEntry } from '../types/seatHistory'

/**
 * One point on a floor-compare sparkline: the count of seat-assignment
 * events that happened on `date` for elements that belong to the floor.
 *
 * The name `assignedSeats` is a small fib — we don't have a clean way to
 * reconstruct the *level* of assigned seats at end-of-day from the history
 * alone (that would require replaying every event against the current
 * elements snapshot), so what the sparkline actually encodes is daily
 * seat-assignment *activity*. In practice "more activity = more churn =
 * more seats being shuffled in or out", which is what a facilities manager
 * wants to see at a glance on a 14-day trend line. Keeping the key name
 * forward-compatible with a future true-level implementation.
 */
export interface FloorSparklinePoint {
  /** ISO yyyy-mm-dd in the viewer's local timezone. */
  date: string
  /** Count of seat-history events on this day for the target floor. */
  assignedSeats: number
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Default trailing window length — matches the spec's 14-day sparkline. */
const DEFAULT_WINDOW_DAYS = 14

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Build the 14-day-trailing sparkline series for a single floor.
 *
 * The `SeatHistoryEntry` shape doesn't carry a `floorId` (history is
 * append-only and floors can be renamed/reordered without rewriting past
 * entries), so callers must provide the set of element ids that live on
 * the target floor — the same set the reducer used for the per-floor
 * metrics row. An entry is "on this floor" when its `elementId` is in
 * that set.
 *
 * Output contract:
 *   - Exactly `windowDays` points (default 14), ordered ascending by date.
 *   - The last point is always `today` (local-timezone day boundary).
 *   - Every day in the window appears with a count — sparse days come
 *     back as zero, so the consumer renders a gap-free polyline.
 *   - Events outside the window (older than `windowDays - 1` days, or
 *     dated after `today`) are ignored; future-dated entries are almost
 *     always clock skew, not signal.
 *
 * Pure — no store reads, no `Date.now()` unless `today` is omitted.
 */
export function floorSparklineSeries(
  entries: SeatHistoryEntry[] | Record<string, SeatHistoryEntry>,
  floorElementIds: ReadonlySet<string> | readonly string[],
  today: Date = new Date(),
  windowDays: number = DEFAULT_WINDOW_DAYS,
): FloorSparklinePoint[] {
  // Normalise the element-id filter once so lookups are O(1) per event.
  const idSet =
    floorElementIds instanceof Set
      ? (floorElementIds as ReadonlySet<string>)
      : new Set<string>(floorElementIds as readonly string[])

  // Pre-seed a dense 14-point series of zeros, keyed by iso date.
  const end = startOfDay(today)
  const start = new Date(end.getTime() - (windowDays - 1) * DAY_MS)
  const points: FloorSparklinePoint[] = []
  const byDate = new Map<string, FloorSparklinePoint>()
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(start.getTime() + i * DAY_MS)
    const point: FloorSparklinePoint = { date: isoDate(d), assignedSeats: 0 }
    points.push(point)
    byDate.set(point.date, point)
  }

  const list = Array.isArray(entries) ? entries : Object.values(entries)
  for (const ev of list) {
    if (!idSet.has(ev.elementId)) continue
    const ts = new Date(ev.timestamp)
    if (Number.isNaN(ts.getTime())) continue
    const key = isoDate(startOfDay(ts))
    const point = byDate.get(key)
    if (point) point.assignedSeats += 1
  }

  return points
}
