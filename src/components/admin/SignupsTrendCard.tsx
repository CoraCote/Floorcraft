import { useEffect, useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import {
  adminSignupsHistogram,
  type SignupHistogramPoint,
} from '../../lib/adminLaunch'
import { Sparkline, TrendBadge } from './Sparkline'
import { summarizeSeries } from './sparklineUtil'

/**
 * Trend card on AdminOverviewPage. Pulls a 30-day per-day signup
 * histogram and renders a pure-SVG bar chart. Hides itself if the
 * RPC returns null (migration 0026 not applied yet) so older
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

  const summary = useMemo(() => summarizeSeries(points ?? []), [points])

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
        <Sparkline points={points} max={summary.max} unit="signup" />
      </div>
      <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums flex justify-between">
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </p>
    </section>
  )
}
