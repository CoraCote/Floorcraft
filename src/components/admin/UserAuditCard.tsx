import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import {
  adminListUserAudit,
  type UserAuditRow,
} from '../../lib/adminLaunch'

/**
 * Per-user audit card on AdminUserDetailPage. Shows events where
 * the user was either actor or target — admin grants/revokes,
 * suspend/unsuspend, password resets, future per-user actions.
 *
 * Each row has an involvement chip (`actor` / `target` / `self`)
 * so the operator can scan whether this user did the thing or it
 * was done to them. Card hides itself if migration 0029 isn't
 * applied so older projects degrade gracefully.
 */
export function UserAuditCard({ userId }: { userId: string }) {
  const [rows, setRows] = useState<UserAuditRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await adminListUserAudit(userId, 50)
      if (cancelled) return
      setLoading(false)
      if (result === null) {
        setMissing(true)
        return
      }
      setMissing(false)
      setRows(result)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (missing) return null
  if (loading) {
    return (
      <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-4">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Loading audit…
        </p>
      </section>
    )
  }
  if (!rows) return null

  return (
    <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <History size={14} aria-hidden="true" />
          Audit timeline
          <span className="text-[10px] font-normal tracking-wider uppercase text-gray-400 dark:text-gray-500">
            ({rows.length})
          </span>
        </h2>
        <Link
          to="/admin/audit"
          className="text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
        >
          Platform audit →
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
          No audit events involving this user yet.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800 max-h-96 overflow-auto">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 px-4 py-2 text-xs"
            >
              <span
                className="text-gray-400 dark:text-gray-500 tabular-nums w-32 shrink-0"
                title={new Date(r.created_at).toUTCString()}
              >
                {new Date(r.created_at).toLocaleString()}
              </span>
              <InvolvementChip kind={r.involvement} />
              <span className="font-mono text-gray-700 dark:text-gray-200 min-w-0 truncate flex-1">
                {r.action}
              </span>
              {r.team_id && (
                <Link
                  to={`/admin/teams/${r.team_id}`}
                  className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline truncate max-w-[140px]"
                >
                  {r.team_name ?? r.team_slug}
                </Link>
              )}
              {r.involvement === 'target' && r.actor_email && (
                <span
                  className="text-gray-500 dark:text-gray-400 truncate max-w-[160px]"
                  title={`Performed by ${r.actor_email}`}
                >
                  by {r.actor_email}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function InvolvementChip({ kind }: { kind: 'actor' | 'target' | 'self' }) {
  const styles =
    kind === 'actor'
      ? 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:bg-gray-800 dark:text-[color:var(--color-blueprint)]'
      : kind === 'target'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider w-12 justify-center shrink-0 ${styles}`}
      title={
        kind === 'actor'
          ? 'This user performed the action'
          : kind === 'target'
            ? 'The action was performed on this user'
            : 'Both actor and target'
      }
    >
      {kind}
    </span>
  )
}
