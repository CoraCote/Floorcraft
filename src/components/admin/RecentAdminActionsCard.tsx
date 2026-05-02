import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert, ShieldCheck, ShieldOff, Trash2, KeyRound, AlertOctagon } from 'lucide-react'
import {
  adminListPlatformAudit,
  type PlatformAuditRow,
} from '../../lib/adminLaunch'

/**
 * Recent high-stakes admin actions on the Overview page. Distinct
 * from the existing "Recent activity" feed (which includes routine
 * office edits) — this card narrows to the actions that change
 * security/identity state across the platform: suspends, admin
 * grants, team deletions, password resets.
 *
 * Pulls a wider window from the same RPC the audit page uses, then
 * filters client-side to the known action codes. Hides itself if
 * the audit RPC isn't available (pre-0022) or there are no matching
 * actions in the lookback window.
 */

const ADMIN_ACTION_META: Record<
  string,
  { label: string; tone: 'red' | 'amber' | 'blue' | 'gray'; icon: React.ReactNode }
> = {
  'admin.user.suspend': {
    label: 'User suspended',
    tone: 'red',
    icon: <ShieldAlert size={11} aria-hidden="true" />,
  },
  'admin.user.unsuspend': {
    label: 'User unsuspended',
    tone: 'blue',
    icon: <ShieldCheck size={11} aria-hidden="true" />,
  },
  'admin.platform_admin.grant': {
    label: 'Platform admin granted',
    tone: 'blue',
    icon: <ShieldCheck size={11} aria-hidden="true" />,
  },
  'admin.platform_admin.revoke': {
    label: 'Platform admin revoked',
    tone: 'amber',
    icon: <ShieldOff size={11} aria-hidden="true" />,
  },
  'admin.team.suspend': {
    label: 'Team suspended',
    tone: 'red',
    icon: <ShieldAlert size={11} aria-hidden="true" />,
  },
  'admin.team.unsuspend': {
    label: 'Team unsuspended',
    tone: 'blue',
    icon: <ShieldCheck size={11} aria-hidden="true" />,
  },
  'admin.team.delete': {
    label: 'Team deleted',
    tone: 'red',
    icon: <Trash2 size={11} aria-hidden="true" />,
  },
  'admin.password_reset.generate': {
    label: 'Password reset generated',
    tone: 'gray',
    icon: <KeyRound size={11} aria-hidden="true" />,
  },
}

const ADMIN_ACTIONS = Object.keys(ADMIN_ACTION_META)

export function RecentAdminActionsCard({
  refreshNonce,
}: {
  refreshNonce: number
}) {
  const [rows, setRows] = useState<PlatformAuditRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Wider sweep — many of these actions are rare so a 200-row
      // generic window from the audit page would mostly miss them.
      const result = await adminListPlatformAudit({ limit: 1000 })
      if (cancelled) return
      setLoading(false)
      setRows(result)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshNonce])

  const visible = useMemo(() => {
    if (!rows) return null
    return rows.filter((r) => ADMIN_ACTIONS.includes(r.action)).slice(0, 8)
  }, [rows])

  if (loading) return null
  if (!visible || visible.length === 0) return null

  return (
    <section className="mt-6 rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <AlertOctagon size={14} aria-hidden="true" />
          Recent admin actions
        </h2>
        <Link
          to="/admin/audit"
          className="text-xs text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
        >
          All events →
        </Link>
      </div>
      <ul className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
        {visible.map((r) => {
          const meta = ADMIN_ACTION_META[r.action]
          return (
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
              <ActionChip meta={meta} />
              <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">
                <span className="text-gray-500 dark:text-gray-400">by</span>{' '}
                {r.actor_email ? (
                  <Link
                    to={`/admin/users?q=${encodeURIComponent(r.actor_email)}`}
                    className="hover:underline"
                  >
                    {r.actor_email}
                  </Link>
                ) : (
                  <span className="text-gray-400">unknown</span>
                )}
                {r.target_type === 'profile' && r.target_id && (
                  <>
                    {' '}
                    <span className="text-gray-500 dark:text-gray-400">→</span>{' '}
                    <Link
                      to={`/admin/users/${r.target_id}`}
                      className="hover:underline"
                    >
                      user
                    </Link>
                  </>
                )}
              </span>
              {r.team_id && (
                <Link
                  to={`/admin/teams/${r.team_id}`}
                  className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline truncate max-w-[140px]"
                >
                  {r.team_name ?? r.team_slug}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ActionChip({
  meta,
}: {
  meta:
    | {
        label: string
        tone: 'red' | 'amber' | 'blue' | 'gray'
        icon: React.ReactNode
      }
    | undefined
}) {
  if (!meta) return null
  const styles =
    meta.tone === 'red'
      ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
      : meta.tone === 'amber'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
        : meta.tone === 'blue'
          ? 'bg-[color:var(--color-blueprint-soft)] dark:bg-gray-800 text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0 ${styles}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  )
}
