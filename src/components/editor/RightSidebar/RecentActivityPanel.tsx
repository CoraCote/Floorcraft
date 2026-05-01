import { useEffect, useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import { listEvents, type AuditEventRow } from '../../../lib/auditRepository'
import { supabase } from '../../../lib/supabase'
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
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

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
        setRefreshing(false)
        setEvents(rows)
        setNow(Date.now())
      } catch (err) {
        if (cancelled) return
        setRefreshing(false)
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        setEvents([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [teamId, refreshNonce])

  function onRefresh() {
    setRefreshing(true)
    setRefreshNonce((n) => n + 1)
  }

  // Real-time updates via Supabase channels. Subscribes to inserts on
  // audit_events filtered to the current team. Limit-20 cap is
  // applied client-side: when a fresh insert arrives, prepend and
  // drop the tail. RLS gates delivery — `audit_events` is
  // team-scoped and members get the broadcast; non-members
  // wouldn't subscribe at all because they can't read the table.
  useEffect(() => {
    if (!teamId) return
    const channel = supabase
      .channel(`audit_events:${teamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_events',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          const inserted = payload.new as AuditEventRow
          setEvents((prev) => {
            if (!prev) return [inserted]
            if (prev.some((e) => e.id === inserted.id)) return prev
            // Cap at 20 — same limit the initial fetch applies.
            return [inserted, ...prev].slice(0, 20)
          })
          setNow(Date.now())
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {events.length} event{events.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-0.5 rounded disabled:opacity-50"
          title="Refresh activity"
          aria-label="Refresh activity"
        >
          <RefreshCw
            size={11}
            aria-hidden="true"
            className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''}
          />
        </button>
      </div>
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
    </div>
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
