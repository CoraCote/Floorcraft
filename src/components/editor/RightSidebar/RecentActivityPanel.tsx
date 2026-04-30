import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { listEvents, type AuditEventRow } from '../../../lib/auditRepository'
import { useProjectStore } from '../../../stores/projectStore'

/**
 * Compact recent-activity feed pulled from the team's `audit_events`
 * table. Mounted in the editor's Insights tab so an owner can see
 * what changed recently — "Sara reassigned to D-12 by Dev 5m ago" —
 * without leaving the canvas for the full Audit Log admin page.
 *
 * Scope: team-wide (the audit table is team-scoped). Most teams have
 * a small enough office count that this reads as the right surface;
 * an office filter can come once metadata.office_id is populated
 * everywhere. Limit 20 — long enough to catch a session's worth of
 * activity, short enough to render fast and stay scanned-not-read.
 *
 * Empty state pitches the share-link / collaborator path so a fresh
 * office (no events yet) doesn't feel broken.
 */
export function RecentActivityPanel() {
  const teamId = useProjectStore((s) => s.currentTeamId)
  const [events, setEvents] = useState<AuditEventRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!teamId) {
        setEvents([])
        return
      }
      try {
        const rows = await listEvents(teamId, { limit: 20 })
        if (cancelled) return
        setEvents(rows)
        setNow(Date.now())
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        setEvents([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [teamId])

  if (events === null) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">Loading activity…</p>
  }
  if (error) {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">
        Couldn&rsquo;t load activity: {error}
      </p>
    )
  }
  if (events.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-2">
        <History size={12} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
        <p>
          No team activity yet. Edits + invites + share-link events will appear
          here as they happen.
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-1.5">
      {events.map((e) => (
        <li
          key={e.id ?? `${e.action}-${e.created_at}`}
          className="rounded border border-[color:var(--color-paper-line)] dark:border-gray-800 px-2 py-1.5"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-mono text-gray-700 dark:text-gray-200 truncate">
              {e.action}
            </span>
            <time
              dateTime={e.created_at}
              title={e.created_at}
              className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0"
            >
              {formatRelative(e.created_at, now)}
            </time>
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {e.target_type}
            {e.target_id ? ` · ${e.target_id.slice(0, 8)}` : ''}
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Compact "3m ago"-style relative formatter. Local helper rather than
 * pulling in lib/time so the audit data on this surface lines up
 * exactly with what AuditLogPage shows. Beyond two weeks we swap to
 * an absolute date; "30d ago" reads worse than the calendar date.
 */
function formatRelative(iso: string | undefined, now: number): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const diff = Math.max(0, now - t)
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 14) return `${day}d ago`
  try {
    return new Date(t).toLocaleDateString()
  } catch {
    return iso
  }
}
