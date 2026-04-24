import { useMemo } from 'react'
import { useSeatHistoryStore } from '../../stores/seatHistoryStore'
import { bucketEvents, maxCount, type ChurnBucket } from '../../lib/churnHeatmap'

/**
 * GitHub-style 13-week x 7-day calendar heatmap of seat-history events.
 *
 * Rendered with SVG primitives — no chart library. The column index maps to
 * the week (oldest left, newest right) and the row index to the day of week
 * (Sun top, Sat bottom). Tile shading is quantized to 5 steps from the
 * window's max-day value. Month labels appear at the top whenever a column's
 * first day is in a new month; weekday labels on the left side are rendered
 * sparsely (Mo/We/Fr) to keep the widget compact.
 *
 * The `today` prop is a seam so tests can run deterministically; in the app
 * it's omitted and defaults to "now".
 */
const TILE = 12
const GAP = 2
const WEEKS = 13
const DAYS_IN_WEEK = 7
const LEFT_LABEL_COL = 24 // px reserved for Mo/We/Fr labels
const TOP_LABEL_ROW = 14 // px reserved for Jan/Feb/... labels

const WEEKDAY_LABELS: Array<{ row: number; text: string }> = [
  { row: 1, text: 'Mo' },
  { row: 3, text: 'We' },
  { row: 5, text: 'Fr' },
]

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Five-step green ramp: [0] = empty/neutral, [1..4] = increasing density.
const SHADES = ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127']

function shadeFor(count: number, max: number): string {
  if (count === 0 || max === 0) return SHADES[0]
  // 1..max -> 1..4 (clamped). Using ceil so any nonzero count lifts off step 0.
  const step = Math.min(4, Math.max(1, Math.ceil((count / max) * 4)))
  return SHADES[step]
}

function formatTooltip(bucket: ChurnBucket): string {
  // `bucket.date` is yyyy-mm-dd in local time; parse back locally.
  const [y, m, d] = bucket.date.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const wk = WEEKDAY_NAMES[date.getDay()].slice(0, 3)
  const mo = MONTH_NAMES[date.getMonth()]
  const label = `${wk} ${mo} ${d}`
  const noun = bucket.count === 1 ? 'event' : 'events'
  return `${label} — ${bucket.count} ${noun}`
}

/** Public for tests; renders even with zero events as long as `forceRender`. */
export function ChurnHeatmap({ today }: { today?: Date } = {}) {
  const entries = useSeatHistoryStore((s) => s.entries)
  const reference = today ?? new Date()

  const buckets = useMemo(
    () => bucketEvents(Object.values(entries), reference, WEEKS),
    // reference.getTime() keeps the memo stable when the default Date is re-made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, reference.getTime()],
  )
  const max = useMemo(() => maxCount(buckets), [buckets])

  if (max === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No seat changes in the last 13 weeks.
      </p>
    )
  }

  // Pre-compute month-change markers: a column gets a label if its first day
  // (row 0 of that week) is in a different month than the previous column's.
  const monthLabels: Array<{ col: number; text: string }> = []
  let lastMonth = -1
  for (let col = 0; col < WEEKS; col++) {
    const firstBucket = buckets[col * DAYS_IN_WEEK]
    const month = Number(firstBucket.date.split('-')[1]) - 1
    if (month !== lastMonth) {
      monthLabels.push({ col, text: MONTH_NAMES[month] })
      lastMonth = month
    }
  }

  const gridWidth = WEEKS * (TILE + GAP) - GAP
  const gridHeight = DAYS_IN_WEEK * (TILE + GAP) - GAP
  const totalWidth = LEFT_LABEL_COL + gridWidth
  const totalHeight = TOP_LABEL_ROW + gridHeight

  return (
    <div>
      <svg
        width={totalWidth}
        height={totalHeight}
        role="img"
        aria-label="Seat change calendar heatmap for the last 13 weeks"
      >
        {/* Month labels along the top. */}
        {monthLabels.map((ml) => (
          <text
            key={`m-${ml.col}`}
            x={LEFT_LABEL_COL + ml.col * (TILE + GAP)}
            y={TOP_LABEL_ROW - 4}
            fontSize="10"
            fill="#6b7280"
          >
            {ml.text}
          </text>
        ))}

        {/* Weekday labels (Mo/We/Fr only). */}
        {WEEKDAY_LABELS.map((wl) => (
          <text
            key={`w-${wl.row}`}
            x={0}
            y={TOP_LABEL_ROW + wl.row * (TILE + GAP) + TILE - 2}
            fontSize="9"
            fill="#6b7280"
          >
            {wl.text}
          </text>
        ))}

        {/* Tiles. */}
        {buckets.map((b, i) => {
          const col = Math.floor(i / DAYS_IN_WEEK)
          const row = i % DAYS_IN_WEEK
          const x = LEFT_LABEL_COL + col * (TILE + GAP)
          const y = TOP_LABEL_ROW + row * (TILE + GAP)
          return (
            <rect
              key={b.date}
              data-churn-tile
              data-date={b.date}
              x={x}
              y={y}
              width={TILE}
              height={TILE}
              rx={2}
              fill={shadeFor(b.count, max)}
            >
              <title>{formatTooltip(b)}</title>
            </rect>
          )
        })}
      </svg>

      {/* Legend. */}
      <div className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <span>Less</span>
        {SHADES.map((c) => (
          <span
            key={c}
            style={{ background: c, width: TILE, height: TILE, borderRadius: 2, display: 'inline-block' }}
            aria-hidden
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
