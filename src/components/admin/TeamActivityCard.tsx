import { useEffect, useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import {
  adminTeamActivityHistogram,
  type ActivityHistogramPoint,
} from '../../lib/adminLaunch'
import { Sparkline, TrendBadge } from './Sparkline'
import { summarizeSeries } from './sparklineUtil'

/**
 * 30-day per-team audit-event sparkline. Shown on AdminTeamDetailPage
 * between the usage card and the recent-events list. Hides itself if
 * migration 0027 isn't applied so older projects degrade gracefully.
 */
export function TeamActivityCard({ teamId }: { teamId: string }) {
  const [points, setPoints] = useState<ActivityHistogramPoint[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await adminTeamActivityHistogram(teamId, 30)
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
  }, [teamId])

  const summary = useMemo(() => summarizeSeries(points ?? []), [points])

  if (missing) return null
  if (loading) {
    return (
      <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Loading activity…
        </p>
      </section>
    )
  }
  if (!points || !summary) return null

  return (
    <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <Activity size={14} aria-hidden="true" />
          Activity · last 30 days
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {summary.total}
            </span>{' '}
            events
          </span>
          <TrendBadge delta={summary.delta} />
        </div>
      </header>
      <div className="mt-3">
        <Sparkline points={points} max={summary.max} unit="event" />
      </div>
      <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums flex justify-between">
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </p>
      {summary.total === 0 && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          No audit events recorded for this team in the last 30 days.
        </p>
      )}
    </section>
  )
}
