import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  Building2,
  Plus,
  Upload,
  Search,
  X,
} from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'
import {
  listOffices,
  createOffice,
  deleteOffice,
  saveOffice,
  type OfficeListItem,
} from '../../lib/offices/officeRepository'
import { buildDemoOfficePayload } from '../../lib/demo/createDemoOffice'
import { ConfirmDialog } from '../editor/ConfirmDialog'
import { OfficeCard } from './OfficeCard'
import type { ThumbnailElement } from './OfficeThumbnail'
import type { Team } from '../../types/team'
import { getRecents } from '../../lib/recentOffices'

/**
 * Wave 14A: refresh the post-login dashboard to match the JSON-Crack /
 * Linear chrome the rest of the app moved to. The page was a bare grid
 * of office cards; it now has:
 *
 *  - A full-width gradient background matching LandingPage, with a
 *    max-w-7xl content container so things stop sprawling on wide
 *    monitors.
 *  - A team-identity header (name + optional logo) with role-gated
 *    "+ New office" button, plus a live-updating subtitle showing
 *    "X offices · Y employees · Z floors".
 *  - A stat strip (same idiom as Wave 13C ReportsPage): uppercase
 *    label + large tabular-nums value across six cards.
 *  - A "Recent" row above the office grid, sourced from
 *    `floocraft.recentOffices` in localStorage.
 *  - Search (auto-focuses on `/`), sort dropdown, and a "has
 *    unassigned / empty / all" filter dropdown.
 *  - A friendly first-run empty state when the team has zero
 *    offices, distinct from the "no search matches" state.
 */

/** Narrow `unknown` to a defensive team-with-optional-logo shape. */
interface TeamWithOptionalLogo extends Team {
  logo_url?: string | null
}

// ------------------------------------------------------------------
// Payload walkers — extract thumbnails + per-office stats from the
// Supabase payload. Shape-defensive throughout: a malformed or
// partial payload collapses to the zero values rather than throwing.
// ------------------------------------------------------------------

/**
 * Pull a flat list of thumbnail-ready rects from an office payload. Uses
 * only the FIRST floor's elements — the team-home page shows one
 * thumbnail per office, and iterating every floor would bloat the DOM
 * on teams with dozens of multi-floor offices for minimal visual
 * payoff. Returns `[]` for any malformed / empty payload; the thumbnail
 * component handles the empty case with a placeholder.
 */
function extractThumbnailElements(
  payload: Record<string, unknown> | null | undefined,
): ThumbnailElement[] {
  if (!payload) return []
  const floors = (payload.floors ?? []) as Array<{
    elements?: Record<string, { x?: number; y?: number; width?: number; height?: number; type?: string }>
  }>
  if (!Array.isArray(floors) || floors.length === 0) return []
  const first = floors[0]
  const elementMap = (first.elements ?? {}) as Record<
    string,
    { x?: number; y?: number; width?: number; height?: number; type?: string }
  >
  const out: ThumbnailElement[] = []
  for (const el of Object.values(elementMap)) {
    if (
      typeof el.x !== 'number' ||
      typeof el.y !== 'number' ||
      typeof el.width !== 'number' ||
      typeof el.height !== 'number'
    )
      continue
    out.push({
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      type: typeof el.type === 'string' ? el.type : 'unknown',
    })
  }
  return out
}

/**
 * Per-office derived stats used by the card metadata row, the
 * team-wide stat strip, and the sort/filter logic. Walks every floor
 * (not just the first like the thumbnail does) so counts are accurate
 * for multi-floor offices.
 */
interface OfficeStats {
  floors: number
  desks: number
  assigned: number
  employees: number
  occupancyPct: number
}

function computeOfficeStats(payload: Record<string, unknown> | null | undefined): OfficeStats {
  if (!payload) return { floors: 0, desks: 0, assigned: 0, employees: 0, occupancyPct: 0 }
  const floors = (payload.floors ?? []) as Array<{
    elements?: Record<string, { type?: string }>
  }>
  let desks = 0
  if (Array.isArray(floors)) {
    for (const f of floors) {
      const elMap = (f.elements ?? {}) as Record<string, { type?: string }>
      for (const el of Object.values(elMap)) {
        if (el.type === 'desk' || el.type === 'hot-desk' || el.type === 'workstation') desks += 1
      }
    }
  }
  // `seats` is the source of truth for assignments — the employees
  // dictionary can contain people who haven't been seated yet. Count
  // distinct occupied seat entries.
  const seats = (payload.seats ?? {}) as Record<string, { employeeId?: string | null }>
  let assigned = 0
  for (const s of Object.values(seats)) {
    if (s && typeof s.employeeId === 'string' && s.employeeId.length > 0) assigned += 1
  }
  const employeeMap = (payload.employees ?? {}) as Record<string, unknown>
  const employees = Object.keys(employeeMap).length
  const occupancyPct = desks > 0 ? Math.round((assigned / desks) * 100) : 0
  return {
    floors: Array.isArray(floors) ? floors.length : 0,
    desks,
    assigned,
    employees,
    occupancyPct,
  }
}

// ------------------------------------------------------------------
// Card avatar helpers — unchanged from the pre-14A layout.
// ------------------------------------------------------------------

interface CardAvatar {
  id: string
  initials: string
  color: string
}

const AVATAR_COLORS = ['#2563eb', '#0891b2', '#9333ea', '#db2777', '#ea580c', '#16a34a', '#ca8a04']

function hashToColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function extractAvatars(payload: Record<string, unknown> | null | undefined): CardAvatar[] {
  if (!payload) return []
  const employeeMap = (payload.employees ?? {}) as Record<string, { id?: string; name?: string }>
  const values = Object.values(employeeMap).filter(
    (e): e is { id: string; name: string } =>
      !!e && typeof e.id === 'string' && typeof e.name === 'string' && e.name.length > 0,
  )
  return values.slice(0, 4).map((e) => ({
    id: e.id,
    initials: initialsFor(e.name),
    color: hashToColor(e.id),
  }))
}

/**
 * Suggest the next default name for a new office.
 */
function nextOfficeName(existing: { name: string }[]): string {
  if (existing.length === 0) return 'Main office'
  let max = 0
  for (const o of existing) {
    const m = /^New office\s+(\d+)$/i.exec(o.name.trim())
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return `New office ${max + 1}`
}

// ------------------------------------------------------------------
// Sort + filter types. Strings live as discriminated unions so the
// <select> rendering stays a single source of truth and an exhaustive
// switch gives us a compile-time guarantee that every option has a
// comparator.
// ------------------------------------------------------------------

type SortMode = 'name' | 'recent' | 'employees' | 'occupancy'
type FilterMode = 'all' | 'unassigned' | 'empty'

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'recent', label: 'Recently opened' },
  { value: 'employees', label: 'Most employees' },
  { value: 'occupancy', label: 'Highest occupancy' },
]

const FILTER_OPTIONS: Array<{ value: FilterMode; label: string }> = [
  { value: 'all', label: 'All offices' },
  { value: 'unassigned', label: 'Has unassigned employees' },
  { value: 'empty', label: 'Empty (no employees)' },
]

// ------------------------------------------------------------------
// Presentational sub-components.
// ------------------------------------------------------------------

/** Stat card — uppercase label + large tabular-nums value. Non-interactive. */
function StatCard({
  label,
  value,
}: {
  label: string
  value: number | string
}) {
  return (
    <div
      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3"
      // Stat cards are read-only summary chrome — keep them out of the
      // tab order entirely so keyboard users don't have to click through
      // six non-actions to reach the search input.
      aria-hidden={false}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {value}
      </div>
    </div>
  )
}

/** Skeleton card used during the initial load. Purely decorative. */
function OfficeCardSkeleton() {
  return (
    <div
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-pulse"
      aria-hidden="true"
    >
      <div className="w-full h-40 bg-gray-100 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded-full w-20" />
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Main page.
// ------------------------------------------------------------------

export function TeamHomePage() {
  const { teamSlug } = useParams<{ teamSlug: string }>()
  const [team, setTeam] = useState<TeamWithOptionalLogo | null>(null)
  const [offices, setOffices] = useState<OfficeListItem[]>([])
  const [loadingOffices, setLoadingOffices] = useState(true)
  const [q, setQ] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OfficeListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [memberCount, setMemberCount] = useState<number>(0)
  const [canCreateOffices, setCanCreateOffices] = useState(false)
  // `recentSlugs` is captured at mount; we intentionally don't reactively
  // update it as the user navigates away and back — the Recent row
  // reflects what the user did *before* this dashboard view. Reloading
  // the page is the refresh gesture.
  const [recentSlugs, setRecentSlugs] = useState<string[]>([])
  const searchRef = useRef<HTMLInputElement>(null)
  const session = useSession()
  const navigate = useNavigate()

  // The session object identity changes on every render (zustand
  // returns a fresh selector snapshot); depend on the stable
  // user-id + status pair so the load effect doesn't re-fire in a
  // loop.
  const sessionUserId =
    session.status === 'authenticated' ? session.user.id : null
  const sessionStatus = session.status

  // Load team + offices. Team-member role + count come from the
  // `team_members` table; a failed role lookup leaves `canCreateOffices`
  // at false (fail-closed — RLS on the server is the real gate, this
  // is just the UI affordance).
  useEffect(() => {
    async function load() {
      setLoadingOffices(true)
      try {
        const { data: t } = await supabase.from('teams').select('*').eq('slug', teamSlug).single()
        if (!t) return
        setTeam(t as TeamWithOptionalLogo)
        setOffices(await listOffices((t as Team).id))
        setRecentSlugs(getRecents())

        // Team-admin gate for "+ New office". We check the session's
        // membership row; RLS on `offices` will ultimately refuse the
        // insert anyway, but hiding the button avoids an obvious
        // dead-end affordance.
        if (sessionStatus === 'authenticated' && sessionUserId) {
          const { data: m } = await supabase
            .from('team_members')
            .select('role')
            .eq('team_id', (t as Team).id)
            .eq('user_id', sessionUserId)
            .maybeSingle()
          const role = (m as { role?: string } | null)?.role
          setCanCreateOffices(role === 'admin' || role === 'member')

          // Member count for the stat strip. A head-count query avoids
          // transferring every row; we only need the number.
          const { count } = await supabase
            .from('team_members')
            .select('user_id', { count: 'exact', head: true })
            .eq('team_id', (t as Team).id)
          setMemberCount(count ?? 0)
        }
      } finally {
        setLoadingOffices(false)
      }
    }
    load()
  }, [teamSlug, sessionStatus, sessionUserId])

  // Global "/" shortcut focuses the search input. Matches the
  // Linear / GitHub pattern — a single unshifted "/" while nothing
  // else is focused jumps to search. Skip when the user is already
  // typing somewhere or a modifier is held.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Precompute per-office stats once per office-list change.
  const officeStats = useMemo(() => {
    const map = new Map<string, OfficeStats>()
    for (const o of offices)
      map.set(o.id, computeOfficeStats(o.payload))
    return map
  }, [offices])

  const officeAvatars = useMemo(() => {
    const map = new Map<string, CardAvatar[]>()
    for (const o of offices) map.set(o.id, extractAvatars(o.payload))
    return map
  }, [offices])

  // Team-wide totals for the stat strip and the subtitle line.
  const totals = useMemo(() => {
    let floors = 0
    let desks = 0
    let assigned = 0
    let employees = 0
    for (const s of officeStats.values()) {
      floors += s.floors
      desks += s.desks
      assigned += s.assigned
      employees += s.employees
    }
    // Weighted average occupancy — each office contributes in
    // proportion to its desk count so a 2-desk outpost doesn't drag
    // the headline number around. `desks === 0` short-circuits to
    // zero to avoid a divide-by-zero.
    const occupancyPct = desks > 0 ? Math.round((assigned / desks) * 100) : 0
    return { floors, desks, assigned, employees, occupancyPct }
  }, [officeStats])

  async function onNew() {
    if (!team || session.status !== 'authenticated') return
    const suggested = nextOfficeName(offices)
    const input = window.prompt('Name this office:', suggested)
    if (input === null) return
    const name = input.trim() || suggested
    setCreating(true)
    try {
      const created = await createOffice(team.id, name)
      navigate(`/t/${team.slug}/o/${created.slug}/map`)
    } finally {
      setCreating(false)
    }
  }

  /**
   * "Import" header action — replaces a previous placeholder alert.
   *
   * Creates a fresh empty office (named by the user, defaulting to a
   * suggestion) and navigates to its roster with `?import=csv`. The
   * RosterPage watches that query param and auto-opens the CSV import
   * dialog so the user lands directly on the import flow rather than
   * an empty office. The CSV import dialog itself was upgraded in
   * Wave 16B (drag-drop, header aliases, template, filter pills,
   * inline edit) so the experience picks up where this leaves off.
   *
   * Future work: a second branch could accept an office-payload JSON
   * (backup format) — for now a "blank office + people CSV" is the
   * common case and ships the button as a real working action.
   */
  async function onImport() {
    if (!team || session.status !== 'authenticated') return
    const suggested = nextOfficeName(offices)
    const input = window.prompt(
      "Name this office. We'll open the CSV import dialog after it's created so you can paste or drop your employee list.",
      suggested,
    )
    if (input === null) return
    const name = input.trim() || suggested
    setCreating(true)
    try {
      const created = await createOffice(team.id, name)
      navigate(`/t/${team.slug}/o/${created.slug}/roster?import=csv`)
    } finally {
      setCreating(false)
    }
  }

  async function onNewDemo() {
    if (!team || session.status !== 'authenticated') return
    setCreating(true)
    try {
      const created = await createOffice(team.id, 'Demo office')
      const payload = buildDemoOfficePayload()
      const res = await saveOffice(
        created.id,
        payload as unknown as Record<string, unknown>,
        created.updated_at,
      )
      if (!res.ok) {
        console.warn('Demo office: initial seed save failed', res)
      }
      navigate(`/t/${team.slug}/o/${created.slug}/roster`)
    } finally {
      setCreating(false)
    }
  }

  async function performDelete(office: OfficeListItem) {
    setDeleting(true)
    const prev = offices
    setOffices((os) => os.filter((o) => o.id !== office.id))
    try {
      await deleteOffice(office.id)
    } catch (err) {
      console.warn('Delete office failed; restoring card', err)
      setOffices(prev)
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  // ----- derived view state ---------------------------------------
  // Filter → search → sort, in that order. Each step is a pure
  // transform over the prior list; the intermediate `filtered` is
  // reused to distinguish "team is empty" from "search matched
  // nothing" in the render below.
  const filteredByMode = useMemo(() => {
    if (filterMode === 'all') return offices
    return offices.filter((o) => {
      const s = officeStats.get(o.id)
      if (!s) return false
      if (filterMode === 'empty') return s.employees === 0
      if (filterMode === 'unassigned') return s.employees > 0 && s.employees > s.assigned
      return true
    })
  }, [offices, officeStats, filterMode])

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return filteredByMode
    return filteredByMode.filter((o) => o.name.toLowerCase().includes(needle))
  }, [filteredByMode, q])

  const visible = useMemo(() => {
    const list = searched.slice()
    const recentIndex = new Map<string, number>()
    recentSlugs.forEach((slug, i) => recentIndex.set(slug, i))
    switch (sortMode) {
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'recent':
        // "Recently opened" = MRU (localStorage) first, then by
        // server `updated_at` for everything else so brand-new
        // offices still float near the top even if the user hasn't
        // opened them yet.
        list.sort((a, b) => {
          const ai = recentIndex.has(a.slug) ? recentIndex.get(a.slug)! : Infinity
          const bi = recentIndex.has(b.slug) ? recentIndex.get(b.slug)! : Infinity
          if (ai !== bi) return ai - bi
          return b.updated_at.localeCompare(a.updated_at)
        })
        break
      case 'employees':
        list.sort((a, b) => {
          const ae = officeStats.get(a.id)?.employees ?? 0
          const be = officeStats.get(b.id)?.employees ?? 0
          return be - ae
        })
        break
      case 'occupancy':
        list.sort((a, b) => {
          const ao = officeStats.get(a.id)?.occupancyPct ?? 0
          const bo = officeStats.get(b.id)?.occupancyPct ?? 0
          return bo - ao
        })
        break
    }
    return list
  }, [searched, sortMode, officeStats, recentSlugs])

  // Recent cards = up to 3 most-recent offices that still exist. We
  // walk `recentSlugs` in MRU order (not `offices.find` per slug,
  // which would reverse us on the filter / sort view above).
  const recentOffices = useMemo(() => {
    if (recentSlugs.length === 0) return []
    const bySlug = new Map(offices.map((o) => [o.slug, o]))
    const out: OfficeListItem[] = []
    for (const slug of recentSlugs) {
      const hit = bySlug.get(slug)
      if (hit) out.push(hit)
      if (out.length >= 3) break
    }
    return out
  }, [recentSlugs, offices])

  if (!team) {
    // Initial team-record fetch. Pre-fix this branch rendered a bare
    // "Loading…" string, which contrasted with the rich skeleton we
    // already render below for offices — the page felt like it had
    // collapsed for a moment before the real chrome painted in. Now
    // we mirror the loaded layout's spine (header strip + stat-card
    // row + skeleton grid) so the visual mass is steady from the
    // first frame. Polite `aria-live` announces the load state for
    // screen readers without re-firing once the team resolves.
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
          <span className="sr-only" role="status" aria-live="polite">
            Loading team…
          </span>
          <div
            className="flex items-center gap-3 mb-6 animate-pulse"
            aria-hidden="true"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-48" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800/60 rounded w-72" />
            </div>
          </div>
          <ul
            className="grid gap-6"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}
            aria-hidden="true"
          >
            <li>
              <OfficeCardSkeleton />
            </li>
            <li>
              <OfficeCardSkeleton />
            </li>
            <li>
              <OfficeCardSkeleton />
            </li>
          </ul>
        </div>
      </div>
    )
  }

  const isTeamEmpty = !loadingOffices && offices.length === 0
  const subtitleText = `${offices.length} ${offices.length === 1 ? 'office' : 'offices'} · ${totals.employees} ${totals.employees === 1 ? 'employee' : 'employees'} · ${totals.floors} ${totals.floors === 1 ? 'floor' : 'floors'}`

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        {/* Team identity header. Logo + name on the left, CTAs on
            the right. The "+ New office" button is only rendered for
            team admins / members — viewers (invited share recipients
            who happened to get a team_member row) fall through.
            Wave 20A: at narrow widths the action cluster wraps to a
            second row (`flex-wrap`), so all four buttons stay
            tappable without clipping. */}
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            {team.logo_url ? (
              <img
                src={team.logo_url}
                alt=""
                aria-hidden="true"
                className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-800 shrink-0"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 shrink-0"
              >
                <Building2 size={20} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 truncate">
                {team.name}
              </h1>
              {/*
                Live subtitle — refreshes as the stat memo recomputes.
                `aria-live="polite"` so a screen reader announces the
                updated count after a create / delete without fighting
                the user's next action.
              */}
              <p
                className="mt-1 text-sm text-gray-500 dark:text-gray-400 tabular-nums"
                aria-live="polite"
              >
                {subtitleText}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canCreateOffices && (
              <>
                <button
                  type="button"
                  onClick={onImport}
                  disabled={creating}
                  title="Create a new office and open the CSV import dialog"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Upload size={14} aria-hidden="true" />
                  Import
                </button>
                <button
                  onClick={onNew}
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                >
                  <Plus size={14} aria-hidden="true" />
                  New office
                </button>
              </>
            )}
            <Link
              to={`/t/${team.slug}/settings`}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              Settings
            </Link>
            <Link
              to="/help"
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-md text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-200"
              title="User guide and FAQ"
            >
              Help
            </Link>
          </div>
        </header>

        {/* Stat strip — matches the Wave 13C ReportsPage idiom.
            Grid collapses to 2 columns on mobile. */}
        {!loadingOffices && !isTeamEmpty && (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 mb-6"
            aria-label="Team summary"
          >
            <StatCard label="Offices" value={offices.length} />
            <StatCard label="Employees" value={totals.employees} />
            <StatCard label="Seats" value={totals.desks} />
            <StatCard label="Occupancy" value={`${totals.occupancyPct}%`} />
            <StatCard label="Members" value={memberCount} />
          </div>
        )}

        {/* Empty / loaded body. Stops here early for the first-run
            case so the welcome card isn't crowded by a search bar
            the user can't meaningfully use yet. */}
        {loadingOffices ? (
          <>
            <span className="sr-only" role="status" aria-live="polite">
              Loading offices…
            </span>
            <ul
              className="grid gap-6 mt-6"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}
              aria-hidden="true"
            >
              <li>
                <OfficeCardSkeleton />
              </li>
              <li>
                <OfficeCardSkeleton />
              </li>
              <li>
                <OfficeCardSkeleton />
              </li>
            </ul>
          </>
        ) : isTeamEmpty ? (
          <EmptyTeamState
            canCreate={canCreateOffices}
            creating={creating}
            onNew={onNew}
            onNewDemo={onNewDemo}
          />
        ) : (
          <>
            {/* Search + sort + filter row. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-0">
                <Search
                  size={14}
                  aria-hidden="true"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search offices…"
                  aria-label="Search offices"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="sr-only sm:not-sr-only">Sort</span>
                <select
                  aria-label="Sort offices"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="sr-only sm:not-sr-only">Filter</span>
                <select
                  aria-label="Filter offices"
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                  className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Recent row. Hidden when there are no stored recents
                that resolve to live offices. Shares the same card
                component so the visual treatment is identical. */}
            {recentOffices.length > 0 && q.trim() === '' && filterMode === 'all' && (
              <section className="mb-6" aria-labelledby="recent-heading">
                <h2
                  id="recent-heading"
                  className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2"
                >
                  Recent
                </h2>
                <ul
                  className="grid gap-6"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}
                >
                  {recentOffices.map((o) => {
                    const stats = officeStats.get(o.id) ?? {
                      floors: 0,
                      desks: 0,
                      assigned: 0,
                      employees: 0,
                      occupancyPct: 0,
                    }
                    const avatars = officeAvatars.get(o.id) ?? []
                    return (
                      <li key={`recent-${o.id}`}>
                        <OfficeCard
                          office={o}
                          teamSlug={team.slug}
                          thumbnailElements={extractThumbnailElements(o.payload)}
                          stats={stats}
                          avatars={avatars}
                          onMenu={(target) => setPendingDelete(target)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {/* Main grid, or a "no matches" empty state. */}
            {visible.length === 0 ? (
              <NoMatchesState
                q={q}
                filterMode={filterMode}
                onReset={() => {
                  setQ('')
                  setFilterMode('all')
                }}
              />
            ) : (
              <section aria-labelledby="all-offices-heading">
                {recentOffices.length > 0 && q.trim() === '' && filterMode === 'all' && (
                  <h2
                    id="all-offices-heading"
                    className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2"
                  >
                    All offices
                  </h2>
                )}
                <ul
                  className="grid gap-6"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}
                >
                  {visible.map((o) => {
                    const stats = officeStats.get(o.id) ?? {
                      floors: 0,
                      desks: 0,
                      assigned: 0,
                      employees: 0,
                      occupancyPct: 0,
                    }
                    const avatars = officeAvatars.get(o.id) ?? []
                    return (
                      <li key={o.id}>
                        <OfficeCard
                          office={o}
                          teamSlug={team.slug}
                          thumbnailElements={extractThumbnailElements(o.payload)}
                          stats={stats}
                          avatars={avatars}
                          onMenu={(target) => setPendingDelete(target)}
                        />
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {/*
              Demo-office disclosure, parked under the grid rather than
              in the header. Still one click for users who want the
              fully-seeded sample; stays out of the way for everyone else.
            */}
            {canCreateOffices && (
              <details className="mt-8 text-xs">
                <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 select-none">
                  Or start from a template
                </summary>
                <div className="mt-2 ml-2">
                  <button
                    onClick={onNewDemo}
                    disabled={creating}
                    className="text-blue-600 dark:text-blue-400 hover:underline disabled:text-gray-400 disabled:no-underline"
                    title="Pre-populated with ~18 demo employees to exercise the roster features"
                  >
                    Sample office · ~18 employees
                  </button>
                </div>
              </details>
            )}
          </>
        )}

        {pendingDelete && (
          <ConfirmDialog
            title={`Delete "${pendingDelete.name}"?`}
            body={
              <div className="space-y-2">
                <p>
                  This removes the floor plan, roster, and every saved edit
                  for this office. It cannot be undone.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Team members with a link will lose access immediately.
                </p>
              </div>
            }
            confirmLabel={deleting ? 'Deleting…' : 'Delete office'}
            cancelLabel="Cancel"
            tone="danger"
            onConfirm={() => {
              if (deleting) return
              void performDelete(pendingDelete)
            }}
            onCancel={() => {
              if (deleting) return
              setPendingDelete(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Empty state components. Split out so the two cases — "team has no
// offices yet" vs "search matched nothing" — are visually distinct
// and the main render stays skimmable.
// ------------------------------------------------------------------

function EmptyTeamState({
  canCreate,
  creating,
  onNew,
  onNewDemo,
}: {
  canCreate: boolean
  creating: boolean
  onNew: () => void
  onNewDemo: () => void
}) {
  return (
    <div className="mt-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-10 text-center max-w-xl mx-auto">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-4">
        <Building2 size={28} aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Welcome to Floorcraft
      </h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Create your first office to start planning.
      </p>
      {canCreate && (
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onNew}
            disabled={creating}
            aria-label="Create office"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            <Plus size={14} aria-hidden="true" />
            Create office
          </button>
          <button
            type="button"
            onClick={onNewDemo}
            disabled={creating}
            className="px-4 py-2 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Pre-populated with ~18 demo employees"
          >
            Try the sample office
          </button>
        </div>
      )}
    </div>
  )
}

function NoMatchesState({
  q,
  filterMode,
  onReset,
}: {
  q: string
  filterMode: FilterMode
  onReset: () => void
}) {
  return (
    <div
      className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-10 text-center max-w-md mx-auto"
      role="status"
      aria-live="polite"
    >
      <Search size={28} className="mx-auto text-gray-300 dark:text-gray-600" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
        No offices match
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {q.trim()
          ? `Nothing matched "${q.trim()}"${filterMode !== 'all' ? ' in this filter' : ''}.`
          : 'This filter has no matching offices.'}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        Clear search & filters
      </button>
    </div>
  )
}
