import type { SparklinePoint } from './sparklineUtil'

/**
 * Tiny SVG bar-chart used by the Overview signup-trend card and the
 * per-team activity card. Pure presentation — the parent owns the
 * data fetch and decides what `unit` label to read out for screen
 * readers and per-bar tooltips.
 *
 * Pure-SVG so we don't need a chart-library dependency for what is
 * essentially a rectangle-per-day strip.
 */
export function Sparkline({
  points,
  max,
  unit = 'event',
}: {
  points: SparklinePoint[]
  max: number
  /** Singular noun for the per-bar tooltip — pluralized when count > 1.
   *  e.g. 'signup' → "2026-04-30: 3 signups". */
  unit?: string
}) {
  const width = 100 // viewBox units; scales via 100% width
  const height = 32
  const barWidth = points.length > 0 ? width / points.length : width
  const gap = barWidth * 0.2
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block w-full h-12 text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]"
      role="img"
      aria-label={`Daily ${unit} count for the last ${points.length} days`}
    >
      {points.map((p, i) => {
        const h = max > 0 ? (p.count / max) * (height - 2) : 0
        const x = i * barWidth + gap / 2
        const y = height - h
        return (
          <rect
            key={p.day}
            x={x}
            y={y}
            width={barWidth - gap}
            height={Math.max(h, p.count > 0 ? 0.6 : 0)}
            fill="currentColor"
            opacity={p.count > 0 ? 1 : 0.15}
          >
            <title>
              {p.day}: {p.count} {unit}
              {p.count === 1 ? '' : 's'}
            </title>
          </rect>
        )
      })}
    </svg>
  )
}

/**
 * "Recent half vs prior half" trend chip used by both the Overview
 * and team-activity cards. Lives next to a number summary.
 */
export function TrendBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[11px] tabular-nums">
        flat
      </span>
    )
  }
  const positive = delta > 0
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] tabular-nums ${
        positive
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
      }`}
      title="Recent half vs earlier half of the window"
    >
      {positive ? '↑' : '↓'} {Math.abs(delta)} vs prior half
    </span>
  )
}
