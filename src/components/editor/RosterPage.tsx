import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowUpDown,
  Download,
  LayoutGrid,
  List,
  Mail,
  MoreHorizontal,
  Plus,
  Upload,
  X,
} from 'lucide-react'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
import {
  deleteEmployee,
  switchToFloor,
  unassignEmployee,
} from '../../lib/seatAssignment'
import type { Employee, EmployeeStatus } from '../../types/employee'
import { EMPLOYEE_STATUSES } from '../../types/employee'
import { RosterDetailDrawer } from './RosterDetailDrawer'
import { downloadCSV, employeesToCSV } from '../../lib/employeeCsv'

type SortColumn = 'name' | 'department' | 'title' | 'seat' | 'status'
type SortDir = 'asc' | 'desc'
// Two display modes for the roster. The default table is great for dense
// spreadsheet-style editing; cards are more scannable on wide screens and
// feel closer to "Who's in the office?" posters on a wall.
type ViewMode = 'list' | 'cards'

// Our office-day checkboxes persist 'Mon'|'Tue'|'Wed'|'Thu'|'Fri' strings
// (see RosterDetailDrawer). Align the "in today" stat to that vocabulary.
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const OFFICE_DAYS_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Named preset views. Each entry is (a) a label shown in the preset picker
 * and (b) a predicate applied to each employee when `?preset=<id>` is
 * active. We keep these as one place so the picker UI and the filter
 * predicate can never drift out of sync.
 *
 * The predicates read ambient fields (`Date.now()`, today's weekday) at
 * call time. That's fine for a local-only UI filter: a fresh render
 * re-evaluates, and we don't care about cross-render stability more
 * granular than a minute.
 */
const ROSTER_PRESETS: Array<{
  id: string
  label: string
  hint: string
  match: (e: Employee) => boolean
}> = [
  {
    id: 'new-hires',
    label: 'New hires · last 30 days',
    hint: 'People whose start date is within the last 30 days',
    match: (e) => withinDays(e.startDate, 30, 'past'),
  },
  {
    id: 'ending-soon',
    label: 'Contracts ending · next 30 days',
    hint: 'People whose end date falls within the next 30 days',
    match: (e) => withinDays(e.endDate, 30, 'future'),
  },
  {
    id: 'unassigned-active',
    label: 'Active · no seat',
    hint: 'Active people who still need a seat assignment',
    match: (e) => e.status === 'active' && !e.seatId,
  },
  {
    id: 'missing-email',
    label: 'Missing email',
    hint: 'Rows with an empty email (blocks "send invite")',
    match: (e) => !e.email?.trim(),
  },
  {
    id: 'missing-photo',
    label: 'Missing photo',
    hint: 'Rows without a photo URL',
    match: (e) => !e.photoUrl?.trim(),
  },
]

function withinDays(iso: string | null, n: number, direction: 'past' | 'future'): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  const delta = t - Date.now()
  if (direction === 'past') return delta <= 0 && delta >= -n * MS_PER_DAY
  return delta >= 0 && delta <= n * MS_PER_DAY
}

function matchesPreset(employee: Employee, presetId: string): boolean {
  const preset = ROSTER_PRESETS.find((p) => p.id === presetId)
  return preset ? preset.match(employee) : true
}

/**
 * Full-height roster view. Reuses `useEmployeeStore` + `useFloorStore`
 * directly (no refactor of the stores) and wires bulk/per-row actions to
 * the existing `lib/seatAssignment` helpers so seat cleanup stays correct.
 *
 * Filter state is URL-synced so deep-links share roster views.
 */
export function RosterPage() {
  const employees = useEmployeeStore((s) => s.employees)
  const floors = useFloorStore((s) => s.floors)
  const departmentColors = useEmployeeStore((s) => s.departmentColors)
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)
  const addEmployee = useEmployeeStore((s) => s.addEmployee)
  const updateEmployee = useEmployeeStore((s) => s.updateEmployee)
  const setCsvImportOpen = useUIStore((s) => s.setCsvImportOpen)

  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const deptFilter = searchParams.get('dept') ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const floorFilter = searchParams.get('floor') ?? ''
  // New filter axes the stats chips can toggle. `seat=unassigned` narrows
  // to people without a seat (useful right after onboarding a batch), and
  // `day=today` narrows to people whose `officeDays` covers the current
  // weekday — an office manager's fastest "who's in?" answer.
  const seatFilter = searchParams.get('seat') ?? ''
  const dayFilter = searchParams.get('day') ?? ''
  // Presets are named views with pre-baked filter semantics that don't
  // cleanly map to a single axis (e.g. "Hired in the last 30 days" is a
  // date computation, not a literal match). They stack on top of the
  // other filters rather than replacing them — so you can still narrow a
  // preset to a specific department.
  const presetFilter = searchParams.get('preset') ?? ''
  // `view` controls layout (list vs. cards) and is deliberately kept out of
  // `hasAnyFilter` — switching to cards doesn't hide people, so the "Clear
  // filters" button shouldn't appear just because the user picked cards.
  const viewMode: ViewMode = searchParams.get('view') === 'cards' ? 'cards' : 'list'
  const hasAnyFilter = Boolean(
    q || deptFilter || statusFilter || floorFilter || seatFilter || dayFilter || presetFilter,
  )

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set(key, value)
      else next.delete(key)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const clearAllFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  // Everything keyed off the current clock stays stable for the lifetime of
  // a single render (so sort order doesn't skew as midnight rolls over
  // mid-session — a fresh render will just pick up the new date).
  const todayLabel = WEEKDAY_LABELS[new Date().getDay()]

  const [sortColumn, setSortColumn] = useState<SortColumn>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)

  const floorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of floors) m[f.id] = f.name
    return m
  }, [floors])

  const allDepartments = useMemo(
    () => Array.from(new Set(Object.keys(departmentColors))).sort(),
    [departmentColors],
  )

  const allEmployees = useMemo(() => Object.values(employees), [employees])
  // The id-set is derived once per store update so the prune effect below
  // can depend on a stable identity instead of re-running for every sort /
  // filter change (which would clobber selection on filter toggles).
  const allEmployeeIds = useMemo(
    () => new Set(allEmployees.map((e) => e.id)),
    [allEmployees],
  )

  const filtered = useMemo(() => {
    let list = allEmployees
    if (q) {
      const needle = q.toLowerCase()
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(needle) ||
          (e.email && e.email.toLowerCase().includes(needle)) ||
          (e.department && e.department.toLowerCase().includes(needle)) ||
          (e.team && e.team.toLowerCase().includes(needle)) ||
          (e.title && e.title.toLowerCase().includes(needle)) ||
          e.tags.some((t) => t.toLowerCase().includes(needle)),
      )
    }
    if (deptFilter) list = list.filter((e) => (e.department ?? '') === deptFilter)
    if (statusFilter) list = list.filter((e) => e.status === statusFilter)
    if (floorFilter) list = list.filter((e) => (e.floorId ?? '') === floorFilter)
    if (seatFilter === 'unassigned') list = list.filter((e) => !e.seatId)
    if (seatFilter === 'assigned') list = list.filter((e) => !!e.seatId)
    // `day` takes a Mon|Tue|Wed|Thu|Fri literal so the weekly mini-chart
    // and the "In <today>" stats chip share one URL key. The chip writes
    // `day=<todayLabel>` rather than a special "today" sentinel.
    if (dayFilter && OFFICE_DAYS_ORDER.includes(dayFilter as typeof OFFICE_DAYS_ORDER[number])) {
      list = list.filter((e) => e.officeDays.includes(dayFilter))
    }
    if (presetFilter) {
      list = list.filter((e) => matchesPreset(e, presetFilter))
    }
    return list
  }, [allEmployees, q, deptFilter, statusFilter, floorFilter, seatFilter, dayFilter, presetFilter])

  // Aggregate counts for the stats bar — derived from the *unfiltered* set
  // so the chips represent "the whole company" and don't flicker as filters
  // apply. `Active` is the default and clicking any chip narrows; clicking
  // "Total" (or any active chip again) clears the relevant axis.
  const stats = useMemo(() => {
    let active = 0
    let onLeave = 0
    let unassigned = 0
    // Per-weekday headcount for the mini capacity chart under the stats
    // chips. Stored as an object keyed by the same Mon-Fri labels the
    // drawer persists to, so no mapping gymnastics needed elsewhere.
    const perDay: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 }
    for (const e of allEmployees) {
      if (e.status === 'active') active++
      if (e.status === 'on-leave') onLeave++
      if (!e.seatId) unassigned++
      for (const d of e.officeDays) {
        if (d in perDay) perDay[d] += 1
      }
    }
    const inToday = perDay[todayLabel] ?? 0
    const peak = Math.max(1, ...Object.values(perDay))
    return { total: allEmployees.length, active, onLeave, unassigned, inToday, perDay, peak }
  }, [allEmployees, todayLabel])

  // Map of duplicate emails → employee ids that share them. We surface a
  // warning chip on these rows so the office admin can dedupe (typically
  // after a CSV import that didn't match on email). Empty strings don't
  // count — plenty of rows legitimately have no email yet.
  const duplicateEmails = useMemo(() => {
    const byEmail = new Map<string, string[]>()
    for (const e of allEmployees) {
      const key = e.email?.trim().toLowerCase()
      if (!key) continue
      const bucket = byEmail.get(key)
      if (bucket) bucket.push(e.id)
      else byEmail.set(key, [e.id])
    }
    const dupes = new Set<string>()
    for (const [email, ids] of byEmail) {
      if (ids.length > 1) dupes.add(email)
    }
    return dupes
  }, [allEmployees])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const copy = [...filtered]
    copy.sort((a, b) => {
      let av = ''
      let bv = ''
      switch (sortColumn) {
        case 'name': av = a.name; bv = b.name; break
        case 'department': av = a.department ?? ''; bv = b.department ?? ''; break
        case 'title': av = a.title ?? ''; bv = b.title ?? ''; break
        case 'seat':
          av = a.seatId ? `${floorMap[a.floorId ?? ''] ?? ''}/${a.seatId}` : ''
          bv = b.seatId ? `${floorMap[b.floorId ?? ''] ?? ''}/${b.seatId}` : ''
          break
        case 'status': av = a.status; bv = b.status; break
      }
      // `sensitivity: 'base'` makes "alice" and "Alice" equal so case
      // differences don't scatter same-spelled names across the list; we
      // also sort numeric segments naturally so "D-2" < "D-10".
      return av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true }) * dir
    })
    return copy
  }, [filtered, sortColumn, sortDir, floorMap])

  // Prune `selected` only when an employee is actually *deleted* from the
  // store — not when a filter hides them. The earlier version pruned
  // against the filtered/sorted set, which meant toggling a filter and
  // clearing it would silently drop the selection on hidden rows (even
  // though those rows were still in the store). Now filters purely hide
  // rows from view; the select-all checkbox still reflects the visible
  // subset via `allVisibleSelected` below.
  useEffect(() => {
    setSelected((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (allEmployeeIds.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [allEmployeeIds])

  // Page-scoped keyboard shortcuts. Deliberately attached to `window` in
  // capture phase so the search input's own keydown (Escape clears) and
  // the drawer's keydown (Escape closes) still get their shot — we only
  // act on events that reach us because nothing stopped propagation.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Do nothing while the drawer (or any other modal) is open.
      if (useUIStore.getState().modalOpenCount > 0) return
      const target = e.target as HTMLElement | null
      const isEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      // `/` focuses search from anywhere on the page (Gmail / GitHub
      // convention). Skip if the user is already typing in something.
      if (e.key === '/' && !isEditing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }
      // `N` adds a new person, same constraints — Shift+N still fires so
      // mashing the shift key doesn't silently drop the shortcut.
      if ((e.key === 'n' || e.key === 'N') && !isEditing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        handleAdd()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSort = (col: SortColumn) => {
    if (col === sortColumn) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDir('asc')
    }
  }

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // "All visible are selected" — the select-all checkbox now reflects the
  // filtered subset rather than the global store, so filtering down to a
  // department and selecting that checkbox only ticks visible rows.
  const allVisibleSelected =
    sorted.length > 0 && sorted.every((e) => selected.has(e.id))
  const someVisibleSelected =
    !allVisibleSelected && sorted.some((e) => selected.has(e.id))

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        // Unselect only the visible rows; keep selections on hidden rows.
        for (const e of sorted) next.delete(e.id)
      } else {
        for (const e of sorted) next.add(e.id)
      }
      return next
    })
  }

  const jumpToSeat = useCallback(
    (emp: Employee) => {
      if (!slug) return
      // Re-read the employee in case the row was edited between click and
      // here (unlikely but cheap). Bail out silently if floor/seat got
      // cleared or the floor has since been deleted.
      const fresh = useEmployeeStore.getState().employees[emp.id] ?? emp
      const floor = fresh.floorId
        ? useFloorStore.getState().floors.find((f) => f.id === fresh.floorId)
        : null
      if (floor) switchToFloor(floor.id)
      if (fresh.seatId) useUIStore.getState().setSelectedIds([fresh.seatId])
      navigate(`/project/${slug}/map`)
    },
    [navigate, slug],
  )

  const handleBulkDelete = () => {
    for (const id of selected) deleteEmployee(id)
    setSelected(new Set())
  }

  const handleBulkUnassign = () => {
    for (const id of selected) unassignEmployee(id)
  }

  // Apply a single-field change to every selected employee. Used by the
  // "Set dept →" and "Set status →" bulk controls — a common office-ops
  // move ("move these 5 contractors to 'departed' for offboarding day").
  // Selection is preserved so the user can follow up with another action.
  const handleBulkSetDepartment = (dept: string) => {
    if (!dept) return
    for (const id of selected) {
      updateEmployee(id, { department: dept })
    }
  }
  const handleBulkClearDepartment = () => {
    for (const id of selected) {
      updateEmployee(id, { department: null })
    }
  }
  const handleBulkSetStatus = (status: EmployeeStatus) => {
    for (const id of selected) {
      updateEmployee(id, { status })
    }
  }

  const handleExportAll = () => {
    const csv = employeesToCSV(allEmployees, employees)
    downloadCSV(`roster-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  const handleExportSelection = () => {
    const chosen = allEmployees.filter((e) => selected.has(e.id))
    if (chosen.length === 0) return
    const csv = employeesToCSV(chosen, employees)
    downloadCSV(`roster-selection-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  const handleAdd = () => {
    const id = addEmployee({ name: 'New person' })
    setDrawerId(id)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Stats bar — at-a-glance office pulse, chips are click-to-filter */}
      <StatsBar
        stats={stats}
        todayLabel={todayLabel}
        active={{ statusFilter, seatFilter, dayFilter }}
        onSetFilter={setFilter}
        onClearAll={clearAllFilters}
      />

      {/* Weekly capacity mini-chart — bars are click-to-filter by day */}
      <WeeklyCapacity
        perDay={stats.perDay}
        peak={stats.peak}
        todayLabel={todayLabel}
        dayFilter={dayFilter}
        onSetFilter={setFilter}
      />

      {/* Filters bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search name, email, dept, team, title, tag…  (press /)"
          value={q}
          onChange={(e) => setFilter('q', e.target.value)}
          onKeyDown={(e) => {
            // Escape while in search = clear the query AND return focus to
            // the page body, so `/` works again without a second press.
            if (e.key === 'Escape' && q) {
              e.preventDefault()
              setFilter('q', '')
            } else if (e.key === 'Escape') {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="flex-1 max-w-md px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={deptFilter}
          onChange={(e) => setFilter('dept', e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filter by department"
        >
          <option value="">All depts</option>
          {allDepartments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setFilter('status', e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {EMPLOYEE_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={floorFilter}
          onChange={(e) => setFilter('floor', e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filter by floor"
        >
          <option value="">All floors</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        {/*
          Preset views — one-click shortcuts for the recurring office-ops
          questions (who started this month? whose contract is ending?
          which active people still need a seat?). Stored in the URL so they
          share-link cleanly and survive a reload.
        */}
        <select
          value={presetFilter}
          onChange={(e) => setFilter('preset', e.target.value)}
          className="px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Preset view"
          title={
            presetFilter
              ? ROSTER_PRESETS.find((p) => p.id === presetFilter)?.hint
              : 'Pre-baked roster views'
          }
        >
          <option value="">All people</option>
          {ROSTER_PRESETS.map((p) => (
            <option key={p.id} value={p.id} title={p.hint}>
              {p.label}
            </option>
          ))}
        </select>

        {hasAnyFilter && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded"
            title="Clear all filters"
          >
            <X size={12} /> Clear filters
          </button>
        )}

        <div className="flex-1" />

        {/*
          List/Cards toggle — a segmented pair of icon buttons. The active
          segment flips to a solid fill so the current mode is obvious
          without reading a label.
        */}
        <div
          className="inline-flex items-center border border-gray-200 rounded overflow-hidden"
          role="group"
          aria-label="View mode"
        >
          <button
            onClick={() => setFilter('view', '')}
            className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium ${
              viewMode === 'list'
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
            aria-pressed={viewMode === 'list'}
            aria-label="List view"
            title="List view"
          >
            <List size={14} />
            List
          </button>
          <button
            onClick={() => setFilter('view', 'cards')}
            className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium border-l border-gray-200 ${
              viewMode === 'cards'
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
            aria-pressed={viewMode === 'cards'}
            aria-label="Card view"
            title="Card view"
          >
            <LayoutGrid size={14} />
            Cards
          </button>
        </div>

        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
          title="Add person (N)"
        >
          <Plus size={14} /> Add person
        </button>
        <button
          onClick={() => setCsvImportOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 rounded"
        >
          <Upload size={14} /> Import
        </button>
        <button
          onClick={handleExportAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 rounded"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Bulk-action bar — only visible with selection */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-5 py-2 bg-blue-50 border-b border-blue-100 flex-shrink-0 text-sm overflow-x-auto whitespace-nowrap">
          <span className="font-medium text-blue-900 flex-shrink-0">
            {selected.size} selected
          </span>

          {/*
            Bulk "Set dept" — the empty value doubles as the control's label
            so the select acts like a menu: picking a dept applies it to
            every selected row and snaps the picker back to the label,
            ready for another pick.
          */}
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (v === '__clear__') handleBulkClearDepartment()
              else handleBulkSetDepartment(v)
            }}
            className="px-2 py-1 text-xs border border-blue-200 rounded bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Set department on selected rows"
          >
            <option value="" disabled>
              Set dept →
            </option>
            {allDepartments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
            {allDepartments.length > 0 && (
              <option disabled>────────</option>
            )}
            <option value="__clear__">Clear department</option>
          </select>

          <select
            value=""
            onChange={(e) => {
              const v = e.target.value as EmployeeStatus | ''
              if (v) handleBulkSetStatus(v)
            }}
            className="px-2 py-1 text-xs border border-blue-200 rounded bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Set status on selected rows"
          >
            <option value="" disabled>
              Set status →
            </option>
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <span className="w-px h-4 bg-blue-200" />

          <button
            onClick={handleBulkUnassign}
            className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white rounded"
          >
            Unassign
          </button>
          <button
            onClick={handleExportSelection}
            className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-white rounded"
          >
            Export selection
          </button>
          <button
            onClick={handleBulkDelete}
            className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 rounded"
          >
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-800 flex-shrink-0"
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {/* Table OR card grid, based on `view` URL param */}
      {viewMode === 'cards' ? (
        <div className="flex-1 overflow-auto p-5 bg-gray-50/50" data-testid="roster-cards">
          {sorted.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-16">
              {hasAnyFilter ? (
                <>
                  No people match these filters.{' '}
                  <button
                    onClick={clearAllFilters}
                    className="text-blue-600 hover:underline"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                'No people yet. Click + Add person or Import CSV to get started.'
              )}
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {sorted.map((emp) => (
                <PersonCard
                  key={emp.id}
                  employee={emp}
                  floorName={emp.floorId ? floorMap[emp.floorId] ?? null : null}
                  deptColor={
                    emp.department
                      ? departmentColors[emp.department] ?? getDepartmentColor(emp.department)
                      : null
                  }
                  isSelected={selected.has(emp.id)}
                  todayLabel={todayLabel}
                  isDuplicateEmail={
                    !!emp.email && duplicateEmails.has(emp.email.trim().toLowerCase())
                  }
                  onToggleSelect={() => toggleRow(emp.id)}
                  onOpen={() => setDrawerId(emp.id)}
                  onJumpToSeat={() => jumpToSeat(emp)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
            <tr>
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected
                  }}
                  onChange={toggleAll}
                  aria-label="Toggle all"
                />
              </th>
              {[
                { key: 'name' as const, label: 'Name', sortable: true },
                { key: 'department' as const, label: 'Department', sortable: true },
                { key: 'title' as const, label: 'Title', sortable: true },
                { key: 'days' as const, label: 'Days', sortable: false },
                { key: 'seat' as const, label: 'Seat', sortable: true },
                { key: 'status' as const, label: 'Status', sortable: true },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key as SortColumn)}
                  className={`px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider select-none whitespace-nowrap ${
                    col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortColumn === col.key && (
                      <ArrowUpDown size={12} className="text-blue-500" />
                    )}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 w-10" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((emp) => (
              <tr
                key={emp.id}
                // Double-click anywhere on the row opens the detail drawer.
                // Faster than reaching for the `⋯` menu on wide screens, and
                // mirrors the spreadsheet mental model ("dive into a record").
                // We guard against editable cells by only reacting to dblclicks
                // whose target isn't an input/button already — React event
                // bubbling means the inner InlineText's own click handler has
                // already had its turn.
                onDoubleClick={(e) => {
                  const t = e.target as HTMLElement
                  if (
                    t.tagName === 'INPUT' ||
                    t.tagName === 'SELECT' ||
                    t.tagName === 'BUTTON' ||
                    t.tagName === 'A'
                  ) return
                  setDrawerId(emp.id)
                }}
                className={`group transition-colors ${selected.has(emp.id) ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
              >
                <td className="px-3 py-1.5 align-middle">
                  <input
                    type="checkbox"
                    checked={selected.has(emp.id)}
                    onChange={() => toggleRow(emp.id)}
                    aria-label={`Select ${emp.name}`}
                  />
                </td>
                <td className="px-3 py-1.5 align-middle font-medium text-gray-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar employee={emp} />
                    <div className="min-w-0 flex-1">
                      <InlineText
                        value={emp.name}
                        // Name is required; silently ignoring an empty commit
                        // would look like a bug ("I hit Enter on nothing — did
                        // it save?"). Reject it so the field reverts visibly.
                        onCommit={(v) => {
                          if (v) updateEmployee(emp.id, { name: v })
                        }}
                        allowEmpty={false}
                        placeholder="—"
                      />
                      {emp.email && (
                        <div className="px-1.5 text-[11px] text-gray-400 truncate flex items-center gap-1" title={emp.email}>
                          {duplicateEmails.has(emp.email.trim().toLowerCase()) && (
                            <span
                              className="inline-flex items-center gap-0.5 text-amber-700 bg-amber-100 px-1 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                              title="Another person shares this email — likely a duplicate from CSV import"
                            >
                              <AlertCircle size={10} /> dupe
                            </span>
                          )}
                          <span className="truncate">{emp.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-1.5 align-middle text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <DeptDot
                      color={
                        emp.department
                          ? departmentColors[emp.department] ??
                            getDepartmentColor(emp.department)
                          : null
                      }
                    />
                    <InlineText
                      value={emp.department ?? ''}
                      onCommit={(v) => updateEmployee(emp.id, { department: v || null })}
                      placeholder="—"
                      listId="roster-dept-list"
                    />
                  </div>
                </td>
                <td className="px-3 py-1.5 align-middle text-gray-600">
                  <InlineText
                    value={emp.title ?? ''}
                    onCommit={(v) => updateEmployee(emp.id, { title: v || null })}
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-1.5 align-middle">
                  <OfficeDays days={emp.officeDays} todayLabel={todayLabel} />
                </td>
                <td className="px-3 py-1.5 align-middle text-gray-600">
                  {emp.seatId && emp.floorId ? (
                    <button
                      onClick={() => jumpToSeat(emp)}
                      className="text-blue-600 hover:underline text-left"
                      title="Show seat on map"
                    >
                      {floorMap[emp.floorId] ?? '?'} / {emp.seatId}
                    </button>
                  ) : (
                    <span className="text-gray-400">Unassigned</span>
                  )}
                </td>
                <td className="px-3 py-1.5 align-middle">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={emp.status}
                      onChange={(e) =>
                        updateEmployee(emp.id, { status: e.target.value as EmployeeStatus })
                      }
                      className="text-xs px-1.5 py-1 border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {EMPLOYEE_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <EndingSoonBadge endDate={emp.endDate} />
                  </div>
                </td>
                <td className="px-3 py-1.5 align-middle relative">
                  <button
                    onClick={() => setOpenMenuId((cur) => (cur === emp.id ? null : emp.id))}
                    className="p-1 rounded hover:bg-gray-200 text-gray-500"
                    aria-label="Row actions"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {openMenuId === emp.id && (
                    <RowActionMenu
                      employee={emp}
                      onEdit={() => {
                        setDrawerId(emp.id)
                        setOpenMenuId(null)
                      }}
                      onUnassign={() => {
                        unassignEmployee(emp.id)
                        setOpenMenuId(null)
                      }}
                      onDelete={() => {
                        deleteEmployee(emp.id)
                        setOpenMenuId(null)
                      }}
                      onClose={() => setOpenMenuId(null)}
                    />
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-gray-400 text-sm">
                  {hasAnyFilter ? (
                    <>
                      No people match these filters.{' '}
                      <button
                        onClick={clearAllFilters}
                        className="text-blue-600 hover:underline"
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    'No people yet. Click + Add person or Import CSV to get started.'
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Datalist for department autocomplete — shared by every inline dept cell */}
        <datalist id="roster-dept-list">
          {allDepartments.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>
      )}

      {/* Footer */}
      <div className="px-5 py-2 border-t border-gray-200 text-xs text-gray-500 flex-shrink-0">
        {sorted.length} of {allEmployees.length} people shown
      </div>

      {drawerId && (
        // `key` forces a fresh mount per employee so the drawer's
        // `defaultValue` inputs re-read current field values instead of
        // showing the previously opened person's data.
        <RosterDetailDrawer
          key={drawerId}
          employeeId={drawerId}
          onClose={() => setDrawerId(null)}
        />
      )}
    </div>
  )
}

/**
 * Single-cell inline editor. Click to enter edit mode, blur or Enter to
 * commit, Escape to abort. Uses `defaultValue` + local ref so the parent
 * doesn't re-render on every keystroke.
 */
function InlineText({
  value,
  onCommit,
  placeholder,
  listId,
  allowEmpty = true,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder: string
  listId?: string
  /**
   * When false, an empty commit is treated as "cancel" — the stored value
   * is left untouched. Callers use this for required columns (e.g. name)
   * where a blank would look like a silent save failure.
   */
  allowEmpty?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = (next: string) => {
    const trimmed = next.trim()
    if (!allowEmpty && trimmed === '') {
      setEditing(false)
      return
    }
    if (trimmed !== value) onCommit(trimmed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        list={listId}
        autoFocus
        defaultValue={value}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-full px-1.5 py-1 text-sm border border-blue-400 rounded bg-white focus:outline-none"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full text-left px-1.5 py-1 rounded hover:bg-white group-hover:bg-white truncate"
    >
      {value || <span className="text-gray-400">{placeholder}</span>}
    </button>
  )
}

/**
 * At-a-glance office-state chips above the filter bar. Each chip is a
 * button — clicking one flips the relevant URL-synced filter on/off so
 * the bar acts like a dashboard + navigation widget together.
 *
 * "Total" clears every axis the chips control (status, seat, day). It
 * leaves `q`, `dept`, and `floor` alone because those are deliberate
 * scopes the user set elsewhere — the chips shouldn't fight the filter
 * controls below.
 */
function StatsBar({
  stats,
  todayLabel,
  active,
  onSetFilter,
  onClearAll,
}: {
  stats: { total: number; active: number; onLeave: number; unassigned: number; inToday: number }
  todayLabel: string
  active: { statusFilter: string; seatFilter: string; dayFilter: string }
  onSetFilter: (key: string, value: string) => void
  onClearAll: () => void
}) {
  const chip = (
    label: string,
    value: number,
    isActive: boolean,
    onClick: () => void,
    tone: 'gray' | 'green' | 'amber' | 'red' | 'blue' = 'gray',
    hint?: string,
  ) => {
    const toneClasses = {
      gray: isActive ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
      green: isActive ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50',
      amber: isActive ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50',
      red: isActive ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-200 hover:bg-red-50',
      blue: isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50',
    }[tone]
    return (
      <button
        onClick={onClick}
        className={`flex items-baseline gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${toneClasses}`}
        title={hint ?? label}
        aria-pressed={isActive}
        // Explicit aria-label — the default accessible name from the two
        // inline <span>s would concatenate without whitespace in some
        // browsers ("1On leave"), which makes the chips hard to query in
        // tests and awkward for screen readers.
        aria-label={`${value} ${label}`}
      >
        <span className="font-semibold tabular-nums">{value}</span>
        <span className="opacity-80">{label}</span>
      </button>
    )
  }

  const noChipFilter =
    !active.statusFilter && !active.seatFilter && !active.dayFilter

  return (
    <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex-shrink-0 overflow-x-auto whitespace-nowrap">
      {chip('Total', stats.total, noChipFilter, onClearAll, 'gray', 'All people (clears status/seat/day filters)')}
      {chip(
        'Active',
        stats.active,
        active.statusFilter === 'active',
        () => onSetFilter('status', active.statusFilter === 'active' ? '' : 'active'),
        'green',
      )}
      {chip(
        'On leave',
        stats.onLeave,
        active.statusFilter === 'on-leave',
        () => onSetFilter('status', active.statusFilter === 'on-leave' ? '' : 'on-leave'),
        'amber',
      )}
      {chip(
        'Unassigned',
        stats.unassigned,
        active.seatFilter === 'unassigned',
        () => onSetFilter('seat', active.seatFilter === 'unassigned' ? '' : 'unassigned'),
        'red',
        'People without a seat',
      )}
      {chip(
        `In ${todayLabel}`,
        stats.inToday,
        active.dayFilter === todayLabel,
        () => onSetFilter('day', active.dayFilter === todayLabel ? '' : todayLabel),
        'blue',
        `People whose office days include ${todayLabel}`,
      )}
    </div>
  )
}

/**
 * Small square color swatch next to the department name. The color comes
 * from the store's `departmentColors` map — the same map that seat fills
 * use on the canvas — so a department's color is consistent across every
 * surface of the app.
 */
/**
 * Horizontal Mon→Fri bar chart of office attendance. Each bar is a button:
 * click to toggle the `day` URL filter and narrow the table to just that
 * day. Today's bar is ringed so it reads differently from the rest even
 * before any interaction. The bars share the same `day` URL key as the
 * "In <today>" stats chip, so the two controls never fight each other.
 */
function WeeklyCapacity({
  perDay,
  peak,
  todayLabel,
  dayFilter,
  onSetFilter,
}: {
  perDay: Record<string, number>
  peak: number
  todayLabel: string
  dayFilter: string
  onSetFilter: (key: string, value: string) => void
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-2 border-b border-gray-100 bg-white flex-shrink-0 overflow-x-auto">
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider flex-shrink-0">
        Week in office
      </div>
      <div className="flex items-end gap-2 min-w-0">
        {OFFICE_DAYS_ORDER.map((d) => {
          const count = perDay[d] ?? 0
          const pct = peak > 0 ? Math.round((count / peak) * 100) : 0
          const isToday = d === todayLabel
          const isActive = dayFilter === d
          return (
            <button
              key={d}
              onClick={() => onSetFilter('day', isActive ? '' : d)}
              className={`group flex flex-col items-center gap-1 px-2 py-1 rounded transition-colors ${
                isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
              title={`${count} in office on ${d}${isActive ? ' — click again to clear' : ''}`}
              aria-pressed={isActive}
              aria-label={`${count} people in office on ${d}`}
            >
              <div className="flex items-end h-8 w-6">
                <div
                  className={`w-full rounded-sm transition-all ${
                    isActive
                      ? 'bg-blue-600'
                      : isToday
                        ? 'bg-blue-400'
                        : 'bg-gray-300 group-hover:bg-gray-400'
                  }`}
                  style={{ height: `${Math.max(pct, count > 0 ? 12 : 6)}%` }}
                />
              </div>
              <div
                className={`text-[10px] font-semibold ${
                  isActive ? 'text-blue-700' : 'text-gray-600'
                } tabular-nums`}
              >
                {count}
              </div>
              <div
                className={`text-[10px] font-medium ${
                  isToday ? 'text-blue-700' : 'text-gray-400'
                }`}
              >
                {d}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DeptDot({ color }: { color: string | null }) {
  if (!color) {
    return (
      <span
        aria-hidden="true"
        className="w-2.5 h-2.5 rounded-sm bg-gray-200 border border-gray-200 flex-shrink-0"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
      style={{ background: color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}
    />
  )
}

/**
 * 5 compact Mon-Fri indicators. Filled = person is in-office that day.
 * Today's column is ringed so "is X coming in today?" is answerable at a
 * glance without reading day letters.
 */
function OfficeDays({ days, todayLabel }: { days: string[]; todayLabel: string }) {
  if (days.length === 0) {
    return <span className="text-[11px] text-gray-300 italic">—</span>
  }
  return (
    <div
      className="flex gap-0.5"
      aria-label={`In office: ${days.join(', ')}`}
      title={`In office: ${days.join(', ')}`}
    >
      {OFFICE_DAYS_ORDER.map((d) => {
        const on = days.includes(d)
        const isToday = d === todayLabel
        return (
          <span
            key={d}
            className={`w-4 h-4 rounded-full text-[8px] font-bold leading-none flex items-center justify-center border ${
              on
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-400 border-gray-200'
            } ${isToday ? 'ring-2 ring-blue-300 ring-offset-1 ring-offset-white' : ''}`}
          >
            {d[0]}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Avatar — photo if we have a URL, otherwise a colored circle with the
 * person's initials. The fallback color is derived from the employee id
 * so it's stable across renders and doesn't flicker when the list resorts,
 * and it avoids colliding with the dept color (which lives on the dot).
 */
function Avatar({ employee }: { employee: Employee }) {
  const initials = useMemo(() => {
    const parts = employee.name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }, [employee.name])
  const hue = useMemo(() => hashHue(employee.id), [employee.id])

  if (employee.photoUrl) {
    return (
      <img
        src={employee.photoUrl}
        alt=""
        className="w-7 h-7 rounded-full object-cover bg-gray-100 flex-shrink-0"
        onError={(e) => {
          // If the URL 404s / CORS-fails, swap in the initials circle by
          // hiding the broken <img> — the sibling fallback renders whenever
          // the image isn't present.
          const img = e.currentTarget as HTMLImageElement
          img.style.display = 'none'
          const sibling = img.nextElementSibling as HTMLElement | null
          if (sibling) sibling.style.display = 'flex'
        }}
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0"
      style={{ background: `hsl(${hue}, 45%, 55%)` }}
    >
      {initials}
    </div>
  )
}

function hashHue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

/**
 * Small amber pill on the status cell when an `endDate` is within 30 days.
 * Helps office managers see upcoming offboarding without opening each
 * drawer. Past end dates get a muted "Ended" label so the row doesn't
 * disappear from attention (the person may still have an active seat).
 */
function EndingSoonBadge({ endDate }: { endDate: string | null }) {
  if (!endDate) return null
  // Parse as local midnight so "end date today" is 0 days away rather than
  // -1 depending on the user's timezone offset.
  const end = new Date(endDate)
  if (Number.isNaN(end.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endMid = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const days = Math.round((endMid.getTime() - today.getTime()) / MS_PER_DAY)
  if (days < 0) {
    return (
      <span
        className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded"
        title={`Ended ${endDate}`}
      >
        Ended
      </span>
    )
  }
  if (days > 30) return null
  const label = days === 0 ? 'Ends today' : days === 1 ? 'Ends tomorrow' : `Ends in ${days}d`
  return (
    <span
      className="text-[10px] font-medium text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded"
      title={`End date: ${endDate}`}
    >
      {label}
    </span>
  )
}

/**
 * Compact card used by the grid view. Shows avatar + name + dept dot +
 * status and a little row of Mon-Fri pills so the density is close to a
 * "who's in the office" board. Clicking the body opens the detail drawer;
 * the seat chip and checkbox are separate clickable targets.
 */
function PersonCard({
  employee,
  floorName,
  deptColor,
  isSelected,
  todayLabel,
  isDuplicateEmail,
  onToggleSelect,
  onOpen,
  onJumpToSeat,
}: {
  employee: Employee
  floorName: string | null
  deptColor: string | null
  isSelected: boolean
  todayLabel: string
  isDuplicateEmail: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onJumpToSeat: () => void
}) {
  const statusTone =
    employee.status === 'active'
      ? 'bg-emerald-100 text-emerald-700'
      : employee.status === 'on-leave'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-gray-100 text-gray-500'
  return (
    <div
      onDoubleClick={(e) => {
        const t = e.target as HTMLElement
        // Same guard as the table row — ignore double-clicks on interactive
        // targets so the drawer doesn't hijack the checkbox / seat button.
        if (
          t.tagName === 'INPUT' ||
          t.tagName === 'BUTTON' ||
          t.tagName === 'A'
        ) return
        onOpen()
      }}
      className={`group relative rounded-lg border bg-white shadow-sm hover:shadow transition-shadow p-3 ${
        isSelected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'
      }`}
    >
      <label className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select ${employee.name}`}
        />
      </label>
      <div className="flex items-start gap-3">
        <Avatar employee={employee} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={onOpen}
              className="text-sm font-semibold text-gray-800 truncate hover:underline text-left"
              title="Open details"
            >
              {employee.name}
            </button>
            {isDuplicateEmail && (
              <span
                className="inline-flex items-center gap-0.5 text-amber-700 bg-amber-100 px-1 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                title="Another person shares this email"
              >
                <AlertCircle size={10} /> dupe
              </span>
            )}
          </div>
          {employee.title && (
            <div className="text-xs text-gray-500 truncate">{employee.title}</div>
          )}
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            <DeptDot color={deptColor} />
            <span className="text-xs text-gray-600 truncate">
              {employee.department ?? <span className="text-gray-400">No department</span>}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2.5">
        <OfficeDays days={employee.officeDays} todayLabel={todayLabel} />
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusTone}`}>
          {employee.status}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px]">
        {employee.seatId ? (
          <button
            onClick={onJumpToSeat}
            className="text-blue-600 hover:underline truncate"
            title="Show seat on map"
          >
            {floorName ?? '?'} / {employee.seatId}
          </button>
        ) : (
          <span className="text-gray-400">Unassigned</span>
        )}
        <EndingSoonBadge endDate={employee.endDate} />
      </div>
    </div>
  )
}

function RowActionMenu({
  employee,
  onEdit,
  onUnassign,
  onDelete,
  onClose,
}: {
  employee: Employee
  onEdit: () => void
  onUnassign: () => void
  onDelete: () => void
  onClose: () => void
}) {
  // "Send invite" only makes sense when we have an address. We still render
  // the button (disabled) when the field is empty so the menu's layout
  // doesn't jump — and the disabled state doubles as a subtle nudge that
  // filling in email unlocks the action.
  const hasEmail = Boolean(employee.email?.trim())
  const mailtoHref = hasEmail ? buildInviteMailto(employee) : undefined
  return (
    <>
      {/*
        Invisible backdrop closes the menu on outside click. It must sit
        above the sticky <thead> (z-10) so the first click outside the menu
        actually closes it instead of getting eaten by the header — that
        was the "takes two clicks to dismiss" bug.
      */}
      <button
        onClick={onClose}
        className="fixed inset-0 z-30 cursor-default"
        aria-label="Close menu"
        tabIndex={-1}
      />
      <div className="absolute right-2 top-full mt-1 z-40 w-48 bg-white border border-gray-200 rounded-md shadow-lg py-1">
        <button
          onClick={onEdit}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          Edit full details
        </button>
        {hasEmail ? (
          <a
            href={mailtoHref}
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            title={`Email ${employee.email}`}
          >
            <Mail size={12} /> Send invite…
          </a>
        ) : (
          <button
            disabled
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-400 cursor-not-allowed"
            title="Add an email to enable invites"
          >
            <Mail size={12} /> Send invite…
          </button>
        )}
        <button
          onClick={onUnassign}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          Unassign seat
        </button>
        <div className="my-1 border-t border-gray-100" />
        <button
          onClick={onDelete}
          className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </>
  )
}

/**
 * Build a `mailto:` link pre-filled with a friendly first-day invite. We
 * keep this deliberately generic so it's useful for both "welcome, please
 * badge in at reception" and "here's your new desk" scenarios — the user
 * can edit the draft in their mail client before sending.
 */
function buildInviteMailto(employee: Employee): string {
  const subject = `Welcome to the office, ${employee.name.split(/\s+/)[0] || employee.name}`
  const lines: string[] = [
    `Hi ${employee.name.split(/\s+/)[0] || employee.name},`,
    '',
    'Welcome aboard! A few quick notes for your first day:',
    '',
  ]
  if (employee.startDate) lines.push(`• Start date: ${employee.startDate}`)
  if (employee.department) lines.push(`• Team: ${employee.department}`)
  if (employee.seatId) lines.push(`• Your desk is reserved — we'll show you on arrival.`)
  lines.push('', 'Reach out if you need anything before then.', '')
  const body = lines.join('\n')
  return `mailto:${encodeURIComponent(employee.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
