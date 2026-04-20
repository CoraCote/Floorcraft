import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowUpDown, Download, Plus, Upload, MoreHorizontal, X } from 'lucide-react'
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

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams)
      if (value) next.set(key, value)
      else next.delete(key)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const [sortColumn, setSortColumn] = useState<SortColumn>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

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
    return list
  }, [allEmployees, q, deptFilter, statusFilter, floorFilter])

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
      {/* Filters bar */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <input
          type="text"
          placeholder="Search name, email, dept, team, title, tag…"
          value={q}
          onChange={(e) => setFilter('q', e.target.value)}
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

        <div className="flex-1" />

        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
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
        <div className="flex items-center gap-3 px-5 py-2 bg-blue-50 border-b border-blue-100 flex-shrink-0 text-sm">
          <span className="font-medium text-blue-900">
            {selected.size} selected
          </span>
          <button
            onClick={handleBulkDelete}
            className="px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 rounded"
          >
            Delete
          </button>
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
            onClick={() => setSelected(new Set())}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-800"
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}

      {/* Table */}
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
                { key: 'name' as const, label: 'Name' },
                { key: 'department' as const, label: 'Department' },
                { key: 'title' as const, label: 'Title' },
                { key: 'seat' as const, label: 'Seat' },
                { key: 'status' as const, label: 'Status' },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortColumn === col.key && <ArrowUpDown size={12} className="text-blue-500" />}
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
                </td>
                <td className="px-3 py-1.5 align-middle text-gray-600">
                  <InlineText
                    value={emp.department ?? ''}
                    onCommit={(v) => updateEmployee(emp.id, { department: v || null })}
                    placeholder="—"
                    listId="roster-dept-list"
                  />
                </td>
                <td className="px-3 py-1.5 align-middle text-gray-600">
                  <InlineText
                    value={emp.title ?? ''}
                    onCommit={(v) => updateEmployee(emp.id, { title: v || null })}
                    placeholder="—"
                  />
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
                <td colSpan={7} className="px-3 py-12 text-center text-gray-400 text-sm">
                  {q || deptFilter || statusFilter || floorFilter
                    ? 'No people match these filters.'
                    : 'No people yet. Click + Add person or Import CSV to get started.'}
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

function RowActionMenu({
  onEdit,
  onUnassign,
  onDelete,
  onClose,
}: {
  onEdit: () => void
  onUnassign: () => void
  onDelete: () => void
  onClose: () => void
}) {
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
      <div className="absolute right-2 top-full mt-1 z-40 w-44 bg-white border border-gray-200 rounded-md shadow-lg py-1">
        <button
          onClick={onEdit}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
        >
          Edit full details
        </button>
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
