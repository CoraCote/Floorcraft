import { useEffect, useState } from 'react'
import { useCan } from '../../hooks/useCan'
import { useProjectStore } from '../../stores/projectStore'
import { listEvents, type AuditEventRow } from '../../lib/auditRepository'

/**
 * Read-only view of `audit_events` for the current office's team. Gated
 * by `useCan('viewAuditLog')` — owner + hr-editor in the pilot matrix.
 *
 * Filters are intentionally minimal for the pilot: actor id exact match,
 * action exact match. The supabase query runs on every filter change —
 * the result set is capped at 200 rows server-side, so re-fetching is
 * cheaper than client-side filtering and keeps `listEvents` as the
 * single source of ordering/limiting truth.
 */
export function AuditLogPage() {
  const canView = useCan('viewAuditLog')
  const teamId = useProjectStore((s) => s.currentTeamId)
  const [events, setEvents] = useState<AuditEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actorFilter, setActorFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  useEffect(() => {
    if (!canView || !teamId) return
    let cancelled = false
    listEvents(teamId, {
      actorId: actorFilter || undefined,
      action: actionFilter || undefined,
    })
      .then((rows) => {
        if (!cancelled) setEvents(rows)
      })
      .catch((err) => {
        console.error('[audit] listEvents failed', err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canView, teamId, actorFilter, actionFilter])

  if (!canView) {
    return <div className="p-6 text-gray-600 dark:text-gray-300">Not authorized to view the audit log.</div>
  }
  if (!teamId) {
    return <div className="p-6 text-gray-600 dark:text-gray-300">No team loaded.</div>
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <div className="flex gap-2">
        <input
          placeholder="Filter by actor id"
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="px-2 py-1 text-sm border border-gray-200 dark:border-gray-800 rounded"
        />
        <input
          placeholder="Filter by action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-2 py-1 text-sm border border-gray-200 dark:border-gray-800 rounded"
        />
      </div>
      {loading ? (
        <div>Loading…</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200 dark:border-gray-800">
              <th className="py-2">When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr
                key={e.id ?? `${e.actor_id}-${e.created_at ?? ''}`}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="py-1">{e.created_at ?? ''}</td>
                <td className="py-1">{e.actor_id}</td>
                <td className="py-1">{e.action}</td>
                <td className="py-1">
                  {e.target_type}/{e.target_id ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
