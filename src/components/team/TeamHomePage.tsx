import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { Building2, Layers, Grid3x3, Users, Plus, Upload } from 'lucide-react'
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
 * Per-office derived stats used by the card metadata row and the
 * team-wide stats strip. Walks every floor (not just the first like the
 * thumbnail does) so counts are accurate for multi-floor offices. The
 * payload is already on the client from `listOffices`, so this costs
 * one O(total-elements) pass — negligible for realistic team sizes.
 */
interface OfficeStats {
  floors: number
  desks: number
  assigned: number
}

function computeOfficeStats(payload: Record<string, unknown> | null | undefined): OfficeStats {
  if (!payload) return { floors: 0, desks: 0, assigned: 0 }
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
  return {
    floors: Array.isArray(floors) ? floors.length : 0,
    desks,
    assigned,
  }
}

/**
 * Pick up to four recent employees from the payload to render initials
 * avatars in the card footer. Shape is defensive — the team payload
 * stores employees as a dictionary keyed by id. We pull whatever's
 * there; if the payload doesn't expose assigned employees cleanly we
 * fall back to the simple count in the card.
 */
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
  // No "recently modified" timestamp on the payload today; take the
  // first N in iteration order. This is stable-ish for Supabase-backed
  // payloads (insertion order) and gives us a non-empty avatar stack
  // without requiring a fresh schema change.
  return values.slice(0, 4).map((e) => ({
    id: e.id,
    initials: initialsFor(e.name),
    color: hashToColor(e.id),
  }))
}

/**
 * Suggest the next default name for a new office. First one is simply
 * "Main office" so an empty team gets a sensible placeholder instead of
 * "Untitled office 1"; subsequent creations use "New office N" where N
 * is one past the highest existing "New office K" counter. This lives
 * inline (not its own file) because it's one-caller and trivial.
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

/**
 * Single-line stat chip. Quiet by default — the icon stays gray-400 and
 * the label gray-500 so a dense row of four doesn't fight the page
 * header. The number itself is gray-900 / semibold to let the eye skim.
 */
function StatChip({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Building2
  value: number | string
  label: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={16} className="text-gray-400" aria-hidden="true" />
      <span>
        <span className="font-semibold text-gray-900">{value}</span>{' '}
        <span>{label}</span>
      </span>
    </div>
  )
}

/** Skeleton card used during the initial load. Purely decorative. */
function OfficeCardSkeleton() {
  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse"
      aria-hidden="true"
    >
      <div className="w-full h-40 bg-gray-100 border-b border-gray-100" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-3/4" />
        <div className="pt-3 border-t border-gray-100">
          <div className="h-5 bg-gray-100 rounded-full w-20" />
        </div>
      </div>
    </div>
  )
}

export function TeamHomePage() {
  const { teamSlug } = useParams<{ teamSlug: string }>()
  const [team, setTeam] = useState<Team | null>(null)
  const [offices, setOffices] = useState<OfficeListItem[]>([])
  const [loadingOffices, setLoadingOffices] = useState(true)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  // Hold the office the user clicked "Delete" on so the ConfirmDialog
  // can name it in the body. `null` means no dialog — any truthy value
  // means the dialog is up and this office is the target.
  const [pendingDelete, setPendingDelete] = useState<OfficeListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const session = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      setLoadingOffices(true)
      try {
        const { data: t } = await supabase.from('teams').select('*').eq('slug', teamSlug).single()
        if (!t) return
        setTeam(t as Team)
        setOffices(await listOffices((t as Team).id))
      } finally {
        setLoadingOffices(false)
      }
    }
    load()
  }, [teamSlug])

  // Precompute per-office stats once per office-list change. Memo keeps
  // the O(elements) walk out of every render.
  const officeStats = useMemo(() => {
    const map = new Map<string, OfficeStats>()
    for (const o of offices) map.set(o.id, computeOfficeStats(o.payload))
    return map
  }, [offices])

  const officeAvatars = useMemo(() => {
    const map = new Map<string, CardAvatar[]>()
    for (const o of offices) map.set(o.id, extractAvatars(o.payload))
    return map
  }, [offices])

  // Team-wide totals. Cheap given the per-office memo above.
  const totals = useMemo(() => {
    let floors = 0
    let desks = 0
    let assigned = 0
    for (const s of officeStats.values()) {
      floors += s.floors
      desks += s.desks
      assigned += s.assigned
    }
    return { floors, desks, assigned }
  }, [officeStats])

  async function onNew() {
    if (!team || session.status !== 'authenticated') return
    // Prompt for a name up front — the previous "Untitled office" default
    // led to a wall of identical-looking cards as soon as an operator
    // created more than one office. `prompt()` is deliberately minimal here:
    // anything the user types flows through the same rename path they'd
    // use in the TopBar, so a typo is trivially recoverable. Empty / Esc
    // cancels the create entirely (contrast: a modal with its own
    // validation state would be overkill for a single text field).
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

  // "Demo office" is a quick-start that seeds a fully populated payload —
  // ~18 employees across 4 departments, manager links, a seated-but-
  // departed person (exercises the unassign cascade), a duplicate
  // name+dept pair (exercises the "rehire?" badge), and a handful of
  // end-dates inside the "Ending soon" window. Creates the row in
  // Supabase, then saves the seeded payload as the very first version so
  // the user can open it and see a live roster immediately.
  async function onNewDemo() {
    if (!team || session.status !== 'authenticated') return
    setCreating(true)
    try {
      const created = await createOffice(team.id, 'Demo office')
      const payload = buildDemoOfficePayload()
      // `created.updated_at` is the version stamp the initial INSERT
      // returned. Passing it back to `saveOffice` just makes the optimistic
      // lock happy — there's no concurrent writer for a brand-new row.
      const res = await saveOffice(
        created.id,
        payload as unknown as Record<string, unknown>,
        created.updated_at,
      )
      if (!res.ok) {
        // Swallow and navigate anyway — an empty office is still usable,
        // and the autosave will retry from the editor. Logging so the
        // failure doesn't vanish silently in dev.
        console.warn('Demo office: initial seed save failed', res)
      }
      navigate(`/t/${team.slug}/o/${created.slug}/roster`)
    } finally {
      setCreating(false)
    }
  }

  // Fire after the user confirms in the dialog. Splits the optimistic
  // list update from the server call so the card disappears instantly,
  // then rolls back if the delete errors out — avoids a stuck "deleting"
  // state on flaky connections.
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

  if (!team) return <div className="p-6 text-sm text-gray-500">Loading…</div>
  const visible = offices.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))
  const canCreate = session.status === 'authenticated'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header: team name + description on the left, primary/secondary CTAs on the right. */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{team.name}</h1>
          <p className="mt-1 text-sm text-gray-500">Plan and manage your workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Search offices…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-1.5 text-sm w-56 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          {canCreate && (
            <>
              <button
                type="button"
                onClick={() => {
                  /* Import UX is not yet wired — secondary CTA exists for shape and to signal forthcoming flow. */
                  window.alert('Import is not available yet. Create a blank office to start, or use the sample office template.')
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-md text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Upload size={14} aria-hidden="true" />
                Import
              </button>
              <button
                onClick={onNew}
                disabled={creating}
                aria-label="Create office"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                <Plus size={14} aria-hidden="true" />
                Create office
              </button>
            </>
          )}
          <Link
            to={`/t/${team.slug}/settings`}
            className="px-3 py-1.5 border border-gray-200 rounded-md text-sm text-gray-700 hover:bg-gray-50"
          >
            Settings
          </Link>
          <Link
            to="/help"
            className="px-3 py-1.5 border border-gray-200 rounded-md text-sm hover:bg-gray-50 text-gray-700"
            title="User guide and FAQ"
          >
            Help
          </Link>
        </div>
      </header>

      {/* Stats strip — quiet, skimmable. Hidden while loading so the numbers don't pop from 0 to real values. */}
      {!loadingOffices && (
        <div className="flex flex-wrap gap-6 text-sm text-gray-500 mb-6">
          <StatChip
            icon={Building2}
            value={offices.length}
            label={offices.length === 1 ? 'office' : 'offices'}
          />
          <StatChip
            icon={Layers}
            value={totals.floors}
            label={totals.floors === 1 ? 'floor' : 'floors'}
          />
          <StatChip
            icon={Grid3x3}
            value={totals.desks}
            label={totals.desks === 1 ? 'desk' : 'desks'}
          />
          <StatChip icon={Users} value={totals.assigned} label="assigned" />
        </div>
      )}

      {/*
        Demo office disclosure. Kept as a discreet "template" surface;
        still one click away when someone wants a fully-seeded sample.
      */}
      {canCreate && offices.length > 0 && (
        <details className="mb-4 text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700 select-none">
            Or start from a template
          </summary>
          <div className="mt-2 ml-2">
            <button
              onClick={onNewDemo}
              disabled={creating}
              className="text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
              title="Pre-populated with ~18 demo employees to exercise the roster features"
            >
              Sample office · ~18 employees
            </button>
          </div>
        </details>
      )}

      {loadingOffices ? (
        <>
          <span className="sr-only" role="status" aria-live="polite">
            Loading offices…
          </span>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden="true">
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
      ) : visible.length === 0 ? (
        q ? (
          <div className="text-center py-16 text-sm text-gray-500">No matches.</div>
        ) : (
          // First-run empty state. Centered card with a decorative icon,
          // a friendly headline (h2 — there's already an h1 for the team
          // name), and dual CTAs so a new user can pick "start blank" or
          // "explore a sample" without hunting.
          <div className="mt-6 bg-white border border-gray-200 rounded-xl p-10 text-center max-w-lg mx-auto">
            <Building2 size={40} className="mx-auto text-gray-300" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">No offices yet</h2>
            <p className="mt-2 text-sm text-gray-500">
              Create your first office to start planning. You can import from a CSV or start with
              a blank canvas.
            </p>
            {canCreate && (
              <div className="mt-5 flex items-center justify-center gap-2">
                <button
                  onClick={onNew}
                  disabled={creating}
                  aria-label="Create office"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                >
                  <Plus size={14} aria-hidden="true" />
                  Create office
                </button>
                <button
                  onClick={onNewDemo}
                  disabled={creating}
                  className="px-3 py-1.5 border border-gray-200 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  title="Pre-populated with ~18 demo employees to exercise the roster features"
                >
                  Try the sample office
                </button>
              </div>
            )}
          </div>
        )
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((o) => {
            const stats = officeStats.get(o.id) ?? { floors: 0, desks: 0, assigned: 0 }
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
              <p className="text-xs text-gray-500">
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
  )
}
