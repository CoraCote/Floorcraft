/**
 * Tiny inline-SVG sparkline for the Floor Compare table.
 *
 * Intentionally zero-dependency: we render a single `<polyline>` at a fixed
 * 60×20 viewBox. That keeps the row height stable, avoids layout thrash on
 * React re-renders, and means the component can be copy-pasted into future
 * report views without pulling in a chart library.
 *
 * Edge cases handled inline so callers don't special-case them:
 *   - Empty series  → a muted em-dash, centered.
 *   - Single point  → a centred dot (a one-point polyline would be
 *                    invisible, and a 0-length line is a chart crime).
 *   - All-zero data → straight line across the baseline (the series IS
 *                    meaningful — "no activity" is a valid trend).
 */

export interface SparklinePoint {
  date: string
  value: number
}

interface Props {
  series: readonly SparklinePoint[]
  /** Override the default 60×20 footprint if a cell needs something tighter. */
  width?: number
  height?: number
  /** Accessible description, e.g. "14-day seat activity for 1F". */
  ariaLabel?: string
}

const DEFAULT_WIDTH = 60
const DEFAULT_HEIGHT = 20
// Leave a little vertical headroom so the stroke doesn't clip at min/max.
const PADDING_Y = 2

export function FloorCompareSparkline({
  series,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  ariaLabel,
}: Props) {
  if (series.length === 0) {
    return (
      <span
        className="inline-block text-gray-300 text-xs leading-none"
        style={{ width, height }}
        aria-label={ariaLabel ?? 'No data'}
        data-sparkline-empty
      >
        —
      </span>
    )
  }

  const values = series.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series (all equal) collapses to a straight baseline line — we
  // still draw it so the row reads "we have data, it didn't change".
  const range = max - min || 1
  const usableHeight = height - PADDING_Y * 2

  // Single-point case: a centred dot is the only honest visual — a polyline
  // with one point renders nothing in every major browser.
  if (series.length === 1) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel ?? 'Single-point series'}
        data-sparkline-single
      >
        <circle cx={width / 2} cy={height / 2} r={1.5} fill="currentColor" />
      </svg>
    )
  }

  const stepX = width / (series.length - 1)
  const points = series
    .map((p, i) => {
      const x = i * stepX
      // Flip Y so higher values sit toward the top of the SVG.
      const y = PADDING_Y + (1 - (p.value - min) / range) * usableHeight
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? `${series.length}-point trend`}
      data-sparkline-polyline
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  )
}
