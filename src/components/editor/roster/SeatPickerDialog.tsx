import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Check, Users, X as XIcon, MapPin, Sparkles } from 'lucide-react'
import { Button, Modal, ModalBody, ModalFooter } from '../../ui'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { useToastStore } from '../../../stores/toastStore'
import { listAvailableSeats, type SeatOption } from '../../../lib/seats/listAvailableSeats'
import { assignEmployee, unassignEmployee } from '../../../lib/seatAssignment'

interface SeatPickerDialogProps {
  open: boolean
  onClose: () => void
  /** Single-assign mode: pick a seat for this one employee. */
  employeeId: string | null
  /**
   * Bulk-assign mode: drain this queue of employees onto chosen seats.
   * Picker stays open after each pick so the user can place all of
   * them in one session. Mutually exclusive with `employeeId`.
   */
  bulkEmployeeIds?: string[]
}

const TYPE_BADGE: Record<SeatOption['type'], string> = {
  desk: 'Desk',
  'hot-desk': 'Hot desk',
  workstation: 'Bench',
  'private-office': 'Office',
}

/**
 * Drafting Studio in-roster seat picker. Replaces the previous flow
 * where assigning a seat from the roster meant clicking "Assign to…",
 * navigating to the map, and clicking each desk one at a time. The
 * picker brings the same operation into the roster surface as a
 * typeahead over every assignable element on every floor.
 *
 * Workstation slot resolution is delegated to `assignEmployee` (it
 * picks the first empty slot when no `slotIndex` is passed). For v1
 * we don't expose per-slot selection — picking a bench just goes to
 * the first free seat. Most operators don't care which slot.
 *
 * Eviction is silent (matches the existing canvas-drop and bulk-flow
 * behavior). A toast surfaces the displaced occupant so the action
 * isn't invisible.
 */
export function SeatPickerDialog({
  open,
  onClose,
  employeeId,
  bulkEmployeeIds,
}: SeatPickerDialogProps) {
  const employees = useEmployeeStore((s) => s.employees)
  const floors = useFloorStore((s) => s.floors)
  const neighborhoods = useNeighborhoodStore((s) => s.neighborhoods)
  const pushToast = useToastStore((s) => s.push)

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [bulkRemaining, setBulkRemaining] = useState<string[]>(() => bulkEmployeeIds ?? [])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Reset transient state lives at the parent level: the dialog is
  // mounted with `key={employeeId}` so each open is a fresh mount and
  // every useState initializer re-runs with the right defaults. That
  // avoids both the set-state-in-effect rule AND the
  // ref-access-during-render rule.

  // Defer focus to the next tick so Modal's own panel autofocus doesn't
  // fight with this one.
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const isBulk = !employeeId && (bulkEmployeeIds?.length ?? 0) > 0
  const currentEmployeeId = isBulk ? bulkRemaining[0] : employeeId
  const currentEmployee = currentEmployeeId ? employees[currentEmployeeId] : null

  const allSeats = useMemo(
    () => listAvailableSeats(floors, employees, neighborhoods),
    [floors, employees, neighborhoods],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? allSeats.filter((s) =>
          [s.deskId, s.floorName, s.neighborhoodName ?? '', ...s.occupantNames]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : allSeats
    // Free-first sort, then by floor name, then by deskId. Operators
    // looking for any open seat see them up top; specific-seat seekers
    // still find their target via the typeahead.
    return [...matches].sort((a, b) => {
      const aFree = a.occupied < a.capacity ? 0 : 1
      const bFree = b.occupied < b.capacity ? 0 : 1
      if (aFree !== bFree) return aFree - bFree
      const fc = a.floorName.localeCompare(b.floorName)
      if (fc !== 0) return fc
      return a.deskId.localeCompare(b.deskId)
    })
  }, [allSeats, query])

  // Keep activeIdx in range as the filtered list shrinks (typing).
  // No setState-in-effect: we cap on read in handlers.
  const safeActive = Math.min(activeIdx, Math.max(filtered.length - 1, 0))

  function commitPick(opt: SeatOption) {
    if (!currentEmployeeId) return
    const evicting =
      opt.type === 'desk' || opt.type === 'hot-desk'
        ? opt.occupied >= 1 && opt.occupantNames[0] !== employees[currentEmployeeId]?.name
        : opt.type === 'workstation'
          ? opt.occupied >= opt.capacity // full bench: assignEmployee will no-op; we still flag as eviction-style
          : false
    assignEmployee(currentEmployeeId, opt.elementId, opt.floorId)
    if (evicting && opt.occupantNames[0]) {
      pushToast({
        tone: 'info',
        title: `Replaced ${opt.occupantNames[0]} on ${opt.deskId}`,
      })
    }
    if (isBulk) {
      const next = bulkRemaining.slice(1)
      setBulkRemaining(next)
      setQuery('')
      setActiveIdx(0)
      if (next.length === 0) onClose()
      return
    }
    onClose()
  }

  function commitUnassign() {
    if (!currentEmployeeId) return
    unassignEmployee(currentEmployeeId)
    if (isBulk) {
      const next = bulkRemaining.slice(1)
      setBulkRemaining(next)
      if (next.length === 0) onClose()
      return
    }
    onClose()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[safeActive]
      if (opt) commitPick(opt)
    }
  }

  // Scroll the active option into view when keyboard navigation moves
  // the highlight past the visible window. Pure DOM side-effect, no
  // setState — won't trip the set-state-in-effect rule.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${safeActive}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [safeActive])

  if (!currentEmployee) {
    // No employee target left — nothing to render. The dialog should
    // already be closed in this state but guard belt-and-braces.
    return null
  }

  const title = isBulk
    ? `Assign seat — ${currentEmployee.name} (${bulkRemaining.length} remaining)`
    : `Assign seat — ${currentEmployee.name}`

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <ModalBody>
        <div className="relative">
          <Search
            size={14}
            aria-hidden="true"
            className="absolute left-2.5 top-2.5 text-gray-400 dark:text-gray-500"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIdx(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search by seat, floor, or neighborhood…"
            aria-label="Search seats"
            className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 pl-7 pr-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
          />
        </div>
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Available seats"
          className="mt-3 max-h-72 overflow-y-auto rounded border border-[color:var(--color-paper-line)] dark:border-gray-800 divide-y divide-[color:var(--color-paper-line)] dark:divide-gray-800"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
              No seats match.
            </li>
          ) : (
            filtered.map((opt, idx) => {
              const free = opt.capacity - opt.occupied
              const isActive = idx === safeActive
              return (
                <li key={`${opt.floorId}:${opt.elementId}`} data-idx={idx}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => commitPick(opt)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-start gap-3 transition-colors ${
                      isActive
                        ? 'bg-[color:var(--color-blueprint-soft)] dark:bg-gray-800'
                        : 'hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <MapPin
                      size={14}
                      aria-hidden="true"
                      className="mt-0.5 flex-shrink-0 text-gray-400 dark:text-gray-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {opt.deskId}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded border border-[color:var(--color-paper-line)] dark:border-gray-700">
                          {TYPE_BADGE[opt.type]}
                        </span>
                        {opt.neighborhoodName && (
                          <span className="text-[10px] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] truncate">
                            {opt.neighborhoodName}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">
                        {opt.floorName}
                        {opt.capacity > 1 && ` · ${free} of ${opt.capacity} free`}
                        {opt.occupantNames.length > 0 && (
                          <>
                            {' · '}
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} aria-hidden="true" />
                              {opt.occupantNames.slice(0, 2).join(', ')}
                              {opt.occupantNames.length > 2 &&
                                ` +${opt.occupantNames.length - 2}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {free > 0 ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                        <Sparkles size={11} aria-hidden="true" />
                        Free
                      </span>
                    ) : (
                      <span className="ml-auto text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex-shrink-0">
                        Will replace
                      </span>
                    )}
                    {currentEmployee.seatId === opt.elementId && (
                      <Check
                        size={14}
                        aria-label="Currently assigned"
                        className="ml-2 flex-shrink-0 text-emerald-600 dark:text-emerald-400"
                      />
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </ModalBody>
      <ModalFooter>
        {currentEmployee.seatId ? (
          <Button variant="ghost" type="button" onClick={commitUnassign}>
            <XIcon size={14} aria-hidden="true" className="mr-1" />
            Unassign
          </Button>
        ) : (
          <span />
        )}
        <Button variant="ghost" type="button" onClick={onClose}>
          {isBulk ? 'Stop' : 'Cancel'}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
