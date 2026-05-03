import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  Building2,
  History,
  Layers,
  Pencil,
  Share2,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Team-side recent activity card on the home dashboard. Reads
 * `audit_events` directly — RLS gates visibility to team members,
 * so the call returns an empty list (not an error) for someone
 * who somehow lands here without membership.
 *
 * Renders a compact list with friendly action labels and the
 * actor's name when available. Best-effort actor join via FK
 * embed; on failure we fall back to "someone".
 *
 * Hides itself entirely when there are zero events — a brand-new
 * team shouldn't get a "no activity yet" card crowding the empty
 * state. The event list lands once any office activity happens.
 */

interface ActivityRow {
  id: string
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  actor_id: string
  /** Foreign-key embed: profiles row keyed by actor_id. The supabase
   *  client returns this as either an object or null depending on
   *  whether the row resolved + read access landed. */
  actor: { name: string | null; email: string | null } | null
}

interface ActionMeta {
  label: (row: ActivityRow) => string
  icon: LucideIcon
  tone: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'gray'
}

const ACTION_META: Record<string, ActionMeta> = {
  'employee.create': {
    label: () => 'added an employee',
    icon: UserPlus,
    tone: 'green',
  },
  'employee.update': {
    label: () => 'updated an employee',
    icon: Pencil,
    tone: 'amber',
  },
  'employee.delete': {
    label: () => 'removed an employee',
    icon: UserMinus,
    tone: 'red',
  },
  'seat.assign': {
    label: () => 'assigned a seat',
    icon: ArrowRightLeft,
    tone: 'green',
  },
  'seat.unassign': {
    label: () => 'cleared a seat',
    icon: ArrowRightLeft,
    tone: 'amber',
  },
  'element.delete': {
    label: () => 'deleted an element',
    icon: Trash2,
    tone: 'red',
  },
  'floor.create': {
    label: () => 'added a floor',
    icon: Layers,
    tone: 'green',
  },
  'floor.duplicate': {
    label: () => 'duplicated a floor',
    icon: Layers,
    tone: 'green',
  },
  'floor.delete': {
    label: () => 'deleted a floor',
    icon: Layers,
    tone: 'red',
  },
  'floor.reorder': {
    label: () => 'reordered floors',
    icon: Layers,
    tone: 'amber',
  },
  'csv.import': {
    label: (r) => {
      const count = (r.metadata?.count as number | undefined) ?? null
      return count !== null ? `imported ${count} rows from CSV` : 'imported a CSV'
    },
    icon: Upload,
    tone: 'blue',
  },
  'demo.load': {
    label: () => 'loaded the demo office',
    icon: Building2,
    tone: 'purple',
  },
  share_token_created: {
    label: () => 'created a share link',
    icon: Share2,
    tone: 'blue',
  },
  share_token_revoked: {
    label: () => 'revoked a share link',
    icon: Share2,
    tone: 'amber',
  },
}

const TONE_CLASSES: Record<ActionMeta['tone'], string> = {
  green: 'text-green-700 dark:text-green-400',
  red: 'text-red-700 dark:text-red-400',
  amber: 'text-amber-700 dark:text-amber-400',
  blue: 'text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]',
  purple: 'text-purple-700 dark:text-purple-400',
  gray: 'text-gray-600 dark:text-gray-400',
}

export function TeamActivityFeed({ teamId }: { teamId: string }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null)
  // Capture-once "now" for relative-time math (React 19's purity rule
  // disallows Date.now() in render — same lazy-init pattern as the
  // admin Users page).
  const [nowMs] = useState<number>(() => Date.now())

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('audit_events')
        .select(
          'id, action, target_type, target_id, metadata, created_at, actor_id, actor:profiles!audit_events_actor_id_fkey(name, email)',
        )
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(8)
      if (cancelled) return
      if (error) {
        console.warn('[team-activity] load failed', error)
        setRows([])
        return
      }
      setRows((data ?? []) as unknown as ActivityRow[])
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [teamId])

  const items = useMemo(() => rows ?? [], [rows])

  if (rows === null) return null
  if (items.length === 0) return null

  return (
    <section className="rounded-lg border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 overflow-hidden mb-6">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
        <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <History size={14} aria-hidden="true" />
          Recent team activity
        </h2>
      </header>
      <ul className="divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800">
        {items.map((r) => {
          const meta = ACTION_META[r.action] ?? {
            label: () => r.action,
            icon: History,
            tone: 'gray' as const,
          }
          const Icon = meta.icon
          const actorName = r.actor?.name?.trim() || r.actor?.email || 'someone'
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 px-4 py-2 text-sm"
            >
              <Icon
                size={14}
                aria-hidden="true"
                className={`shrink-0 ${TONE_CLASSES[meta.tone]}`}
              />
              <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {actorName}
                </span>{' '}
                <span className="text-gray-600 dark:text-gray-300">
                  {meta.label(r)}
                </span>
              </span>
              <span
                className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0"
                title={new Date(r.created_at).toLocaleString()}
              >
                {formatRelative(nowMs - new Date(r.created_at).getTime())}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function formatRelative(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  const yr = Math.floor(day / 365)
  return `${yr}y ago`
}
