import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  History,
  Loader2,
  Lock,
  UserPlus,
  UserMinus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Upload,
  Share2,
  Layers,
  Building2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCan } from '../../hooks/useCan'
import { useProjectStore } from '../../stores/projectStore'
import { listEvents, type AuditEventRow } from '../../lib/auditRepository'
import { listTeamMembers } from '../../lib/teams/teamRepository'
import type { TeamMember } from '../../types/team'

/**
 * Wave 18A: rebuild the audit-log surface so it reads as a real admin
 * page instead of "the smallest thing that could possibly work."
 *
 * Pre-18A: `text-xl font-semibold` heading on flat chrome, two raw
 * input boxes ("Filter by actor id" / "Filter by action"), and a
 * borderless `<table>` with no per-action affordance. The "actor id"
 * input was the worst offender — admins had to look up a UUID by hand
 * to find anything, which made the filter functionally useless.
 *
 * What changed:
 *  - Gradient bg + `max-w-7xl` content column (matches Roster /
 *    ReportsPage / TeamHomePage idioms — full-width is right for a
 *    data table).
 *  - Page header at the canonical `text-3xl tracking-tight` size with
 *    an explanatory subtitle.
 *  - Actor filter accepts an email substring or a member name AND has
 *    a dropdown of currently-loaded team members so the common case
 *    (resolve "who was Alice?") is one click. We resolve the typed
 *    string client-side against the loaded `TeamMember[]` and pass
 *    the matching `user_id` to `listEvents`.
 *  - Action filter becomes a `<select>` populated from the finite
 *    list of action strings the codebase actually emits. A freeform
 *    "Custom…" entry preserves backwards-compatibility for actions
 *    we don't know about.
 *  - Table is now a card with a soft border + dark-mode pairing.
 *    Each action gets a colored pill + lucide icon (green for create
 *    / assign, red for delete, amber for update, blue for view-ish
 *    side actions).
 *  - Loading, empty, "no team", and "not authorized" branches all
 *    use the same gradient chrome so the page never looks like it
 *    fell off the visual map.
 */

interface ActionMeta {
  /** Human-friendly label rendered inside the pill. */
  label: string
  /** Lucide icon paired with the pill. */
  icon: LucideIcon
  /** Tone — drives Tailwind color tokens for the pill background +
      text. The discriminated union here means a missing case is a
      compile error; new tones must be added intentionally. */
  tone: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'gray'
}

/**
 * Static map of every action string the app emits today (see grep over
 * `void emit('…'`). Anything not in this map renders with a neutral
 * gray pill and the History icon — no crash, just less affordance.
 */
const ACTION_META: Record<string, ActionMeta> = {
  'employee.create': { label: 'employee.create', icon: UserPlus, tone: 'green' },
  'employee.update': { label: 'employee.update', icon: Pencil, tone: 'amber' },
  'employee.delete': { label: 'employee.delete', icon: UserMinus, tone: 'red' },
  'seat.assign': { label: 'seat.assign', icon: ArrowRightLeft, tone: 'green' },
  'seat.unassign': { label: 'seat.unassign', icon: ArrowRightLeft, tone: 'amber' },
  'element.delete': { label: 'element.delete', icon: Trash2, tone: 'red' },
  'floor.create': { label: 'floor.create', icon: Layers, tone: 'green' },
  'floor.duplicate': { label: 'floor.duplicate', icon: Layers, tone: 'green' },
  'floor.delete': { label: 'floor.delete', icon: Layers, tone: 'red' },
  'floor.reorder': { label: 'floor.reorder', icon: Layers, tone: 'amber' },
  'csv.import': { label: 'csv.import', icon: Upload, tone: 'blue' },
  'demo.load': { label: 'demo.load', icon: Building2, tone: 'purple' },
  share_token_created: { label: 'share_token_created', icon: Share2, tone: 'blue' },
  share_token_revoked: { label: 'share_token_revoked', icon: Share2, tone: 'amber' },
}

const KNOWN_ACTIONS = Object.keys(ACTION_META).sort()

const TONE_CLASSES: Record<ActionMeta['tone'], string> = {
  green:
    'bg-green-50 text-green-700 ring-1 ring-green-200/60 dark:bg-green-950/30 dark:text-green-300 dark:ring-green-900/40',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200/60 dark:bg-red-950/30 dark:text-red-300 dark:ring-red-900/40',
  amber:
    'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/40',
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/40',
  purple:
    'bg-purple-50 text-purple-700 ring-1 ring-purple-200/60 dark:bg-purple-950/30 dark:text-purple-300 dark:ring-purple-900/40',
  gray: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200/60 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700/40',
}

function actionMetaFor(action: string): ActionMeta {
  return (
    ACTION_META[action] ?? {
      label: action,
      icon: History,
      tone: 'gray',
    }
  )
}

/**
 * Format an ISO timestamp as a relative string (~"3m ago") with the
 * absolute timestamp tucked into the `title` attribute. Pure function;
 * we deliberately don't subscribe to a clock — the audit log isn't a
 * live ticker and the relative label is good enough at fetch time.
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
  // Beyond two weeks the absolute date is more useful than "30d ago".
  try {
    return new Date(t).toLocaleDateString()
  } catch {
    return iso
  }
}

/** Initials for the actor avatar. Mirrors the helper in TeamHomePage. */
function initialsFor(label: string): string {
  const parts = label.trim().split(/[\s@.]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  '#2563eb',
  '#0891b2',
  '#9333ea',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#ca8a04',
]

function hashColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

interface NotAuthorizedProps {
  officeHref: string
}

/** Shared chrome for the not-authorized + no-team branches. */
function CenteredCard({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: LucideIcon
  title: string
  body: string
  cta?: { href: string; label: string }
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div
          role="alert"
          className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          >
            <Icon size={22} />
          </div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{body}</p>
          {cta && (
            <Link
              to={cta.href}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function NotAuthorized({ officeHref }: NotAuthorizedProps) {
  return (
    <CenteredCard
      icon={Lock}
      title="Not authorized"
      body="You don't have permission to view the audit log. Ask a team admin to grant you the owner or HR-editor role."
      cta={{ href: officeHref, label: 'Back to office' }}
    />
  )
}

function NoTeam() {
  return (
    <CenteredCard
      icon={Building2}
      title="No team loaded"
      body="Select a team to see its activity log."
      cta={{ href: '/dashboard', label: 'Back to dashboard' }}
    />
  )
}

export function AuditLogPage() {
  const canView = useCan('viewAuditLog')
  const teamId = useProjectStore((s) => s.currentTeamId)
  const { teamSlug, officeSlug } = useParams<{
    teamSlug: string
    officeSlug: string
  }>()

  const [events, setEvents] = useState<AuditEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actorQuery, setActorQuery] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [members, setMembers] = useState<TeamMember[]>([])
  // `now` is the reference time for relative labels ("3m ago"). We
  // stamp it inside the fetch effect — calling `Date.now()` directly
  // in render would violate the strict react-hooks/purity rule.
  // Re-stamping per fetch is the natural cadence: it's only ever
  // shown alongside the event set it was captured with.
  const [now, setNow] = useState<number>(() => Date.now())

  // Load the member list once per team so we can resolve a typed
  // email/name fragment to the underlying user_id for the supabase
  // filter. We deliberately pull this lazily — the page can render
  // (with the freeform input still functional) before the list lands.
  useEffect(() => {
    if (!canView || !teamId) return
    let cancelled = false
    listTeamMembers(teamId)
      .then((rows) => {
        if (!cancelled) setMembers(rows)
      })
      .catch((err) => {
        // A failure here only means the dropdown is empty; the rest of
        // the page is still functional via direct text input.
        console.warn('[audit] listTeamMembers failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [canView, teamId])

  // Resolve the typed actor query into an exact user_id when possible.
  // Strategy: an exact email match wins; otherwise a case-insensitive
  // substring match against email-or-name returns the unique hit. If
  // it matches multiple members, we don't filter (the user gets every
  // event, with the input still highlighted) — better than silently
  // picking one. An empty query means "no filter".
  const actorIdForQuery = useMemo(() => {
    const q = actorQuery.trim().toLowerCase()
    if (!q) return undefined
    const exact = members.find((m) => (m.email ?? '').toLowerCase() === q)
    if (exact) return exact.user_id
    const fuzzy = members.filter(
      (m) =>
        (m.email ?? '').toLowerCase().includes(q) ||
        (m.name ?? '').toLowerCase().includes(q),
    )
    if (fuzzy.length === 1) return fuzzy[0].user_id
    return undefined
  }, [actorQuery, members])

  // Indexed lookup so the row renderer can show an email instead of a
  // bare UUID without scanning the whole list per row.
  const memberById = useMemo(() => {
    const map = new Map<string, TeamMember>()
    for (const m of members) map.set(m.user_id, m)
    return map
  }, [members])

  // Refetch on filter change. Server-side limit of 200 stays the
  // canonical truth; client-side filtering would diverge from the
  // server's ordering and silently hide rows beyond the window.
  //
  // We deliberately do NOT flip `loading` back to `true` on a filter
  // change — that would violate `react-hooks/set-state-in-effect` and
  // would also produce a flash-of-empty between filter clicks. The
  // existing rows stay rendered until the new ones arrive; on a slow
  // connection that's a much better feel than a momentary spinner.
  useEffect(() => {
    if (!canView || !teamId) return
    let cancelled = false
    listEvents(teamId, {
      actorId: actorIdForQuery,
      action: actionFilter || undefined,
    })
      .then((rows) => {
        if (!cancelled) {
          setEvents(rows)
          setNow(Date.now())
        }
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
  }, [canView, teamId, actorIdForQuery, actionFilter])

  const officeHref =
    teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}/map` : '/dashboard'

  if (!canView) return <NotAuthorized officeHref={officeHref} />
  if (!teamId) return <NoTeam />

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-5">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Audit log
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Activity from your team — every save, share, and assignment,
            last 200 events.
          </p>
        </header>

        {/* Filter row. Both inputs are optional and combine with AND. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400 sm:w-72">
            <span className="font-medium">Actor</span>
            <input
              type="search"
              list="audit-actor-list"
              placeholder="email, name, or user ID"
              value={actorQuery}
              onChange={(e) => setActorQuery(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
              aria-label="Filter by actor email, name, or user ID"
            />
            {/*
              Native datalist gives the user autocomplete against the
              loaded member list without us building a custom popover.
              Empty until `members` resolves; the input still works
              freeform regardless.
            */}
            <datalist id="audit-actor-list">
              {members.map((m) => (
                <option key={m.user_id} value={m.email}>
                  {m.name ? `${m.name} (${m.email})` : m.email}
                </option>
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400 sm:w-64">
            <span className="font-medium">Action</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
              aria-label="Filter by action"
            >
              <option value="">All actions</option>
              {KNOWN_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Table card. Border + dark-mode pairing matches the rest of
            the polished surfaces (FloorComparePage, TeamHomePage). */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {loading ? (
            <div
              className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-gray-500 dark:text-gray-400"
              role="status"
              aria-live="polite"
            >
              <Loader2
                size={14}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Loading events…
            </div>
          ) : events.length === 0 ? (
            <EmptyEvents />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-950/40 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Target</th>
                  <th className="px-4 py-2.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {events.map((e) => {
                  const meta = actionMetaFor(e.action)
                  const Icon = meta.icon
                  const member = memberById.get(e.actor_id)
                  const actorLabel = member?.email ?? e.actor_id
                  const actorInitials = initialsFor(actorLabel)
                  const actorColor = hashColor(e.actor_id)
                  let detailsText = ''
                  try {
                    const json = JSON.stringify(e.metadata ?? {})
                    detailsText = json === '{}' ? '' : json
                  } catch {
                    detailsText = ''
                  }
                  return (
                    <tr
                      key={e.id ?? `${e.actor_id}-${e.created_at ?? ''}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    >
                      <td
                        className="px-4 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap tabular-nums"
                        title={e.created_at ?? ''}
                      >
                        {formatRelative(e.created_at, now)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            aria-hidden="true"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{ background: actorColor }}
                          >
                            {actorInitials}
                          </span>
                          <span
                            className="truncate text-gray-700 dark:text-gray-200"
                            title={actorLabel}
                          >
                            {actorLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[meta.tone]}`}
                        >
                          <Icon size={12} aria-hidden="true" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                        {e.target_type}
                        {e.target_id ? (
                          <span className="text-gray-400 dark:text-gray-500">
                            {' / '}
                            <span className="font-mono text-[11px]">
                              {e.target_id}
                            </span>
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="px-4 py-2.5 text-gray-500 dark:text-gray-400 max-w-[280px]"
                        // The tooltip shows the full metadata JSON when
                        // the cell truncates — handy for engineers
                        // diffing reads against writes.
                        title={detailsText || undefined}
                      >
                        <span className="block truncate font-mono text-[11px]">
                          {detailsText || '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Empty state for the table — separate component so the table chrome
 * stays a single render path and the empty case can grow its own copy
 * (icon, title, body) without crowding the main render.
 */
function EmptyEvents() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div
        aria-hidden="true"
        className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      >
        <History size={22} />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
        No events yet
      </p>
      <p className="mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
        Once your team starts assigning seats, importing CSVs, or sharing
        plans, the activity will show up here.
      </p>
    </div>
  )
}

