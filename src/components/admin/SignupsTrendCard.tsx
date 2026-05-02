import { useEffect, useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import {
  adminSignupsHistogram,
  type SignupHistogramPoint,
} from '../../lib/adminLaunch'

/**
 * Trend card on AdminOverviewPage. Pulls a 30-day per-day signup
 * histogram and renders a pure-SVG bar chart so we don't pull in
 * a chart library for a single surface. The card hides itself if
 * the RPC returns null (migration 0026 not applied yet) so older
 * projects degrade gracefully.
 */
export function SignupsTrendCard({
  refreshNonce,
}: {
  refreshNonce: number
}) {
  const [points, setPoints] = useState<SignupHistogramPoint[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await adminSignupsHistogram(30)
      if (cancelled) return
      setLoading(false)
      if (result === null) {
        setMissing(true)
        return
      }
      setMissing(false)
      setPoints(result)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshNonce])

  const summary = useMemo(() => {
    if (!points || points.length === 0) return null
    const total = points.reduce((acc, p) => acc + p.count, 0)
    const max = Math.max(...points.map((p) => p.count), 1)
    const half = Math.floor(points.length / 2)
    const recent = points.slice(half).reduce((a, p) => a + p.count, 0)
    const earlier = points.slice(0, half).reduce((a, p) => a + p.count, 0)
    const delta = recent - earlier
    return { total, max, recent, earlier, delta }
  }, [points])

  if (missing) return null
  if (loading) {
    return (
      <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
        <p className="text-xs text-gray-400 dark:text-gray-500">Loading trend…</p>
      </section>
    )
  }
  if (!points || !summary) return null

  return (
    <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <TrendingUp size={14} aria-hidden="true" />
          Signups · last 30 days
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {summary.total}
            </span>{' '}
            total
          </span>
          <TrendBadge delta={summary.delta} />
        </div>
      </header>
      <div className="mt-3">
        <Sparkline points={points} max={summary.max} />
      </div>
      <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums flex justify-between">
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </p>
    </section>
  )
}

function TrendBadge({ delta }: { delta: number }) {
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

function Sparkline({
  points,
  max,
}: {
  points: SignupHistogramPoint[]
  max: number
}) {
  const width = 100 // viewBox units; scales via 100% width
  const height = 32
  const barWidth = width / points.length
  const gap = barWidth * 0.2
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block w-full h-12 text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]"
      role="img"
      aria-label={`Daily signups for the last ${points.length} days`}
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
              {p.day}: {p.count} signup{p.count === 1 ? '' : 's'}
            </title>
          </rect>
        )
      })}
    </svg>
  )
}
