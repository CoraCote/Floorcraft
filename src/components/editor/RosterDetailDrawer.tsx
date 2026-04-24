import { useEffect, useRef, useState } from 'react'
import { AlertCircle, X, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
import { useToastStore } from '../../stores/toastStore'
import { useCan } from '../../hooks/useCan'
import type {
  Accommodation,
  AccommodationType,
  Employee,
  EmployeeStatus,
  LeaveType,
  PendingStatusChange,
} from '../../types/employee'
import {
  ACCOMMODATION_ICONS,
  ACCOMMODATION_LABELS,
  ACCOMMODATION_TYPES,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  LEAVE_TYPES,
} from '../../types/employee'
import { findManagerCycle } from '../../lib/managerChain'
import { SeatHistoryDrawer } from './SeatHistoryDrawer'
import { todayIsoDate } from '../../lib/time'

interface Props {
  employeeId: string
  onClose: () => void
}

const EQUIPMENT_STATUSES: Array<Employee['equipmentStatus']> = [
  'pending',
  'provisioned',
  'not-needed',
]

const OFFICE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

/**
 * Named office-day presets surfaced as quick-pick buttons under the
 * Mon-Fri pills. HR typically sets the same few patterns on 80% of new
 * hires; a one-click preset saves 5 taps per person on bulk onboarding.
 */
const OFFICE_DAY_PRESETS: Array<{ id: string; label: string; days: string[] }> = [
  { id: 'weekdays', label: 'Weekdays', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  { id: 'mwf', label: 'MWF', days: ['Mon', 'Wed', 'Fri'] },
  { id: 'tth', label: 'TTh', days: ['Tue', 'Thu'] },
  { id: 'hybrid', label: 'Hybrid (TWTh)', days: ['Tue', 'Wed', 'Thu'] },
  { id: 'none', label: 'Remote', days: [] },
]

/**
 * Slide-in detail drawer for the "Edit full details" action. Shows every
 * Employee field that isn't already in the roster's 5 primary columns.
 *
 * Submit-on-blur / on-change — every field writes through
 * `updateEmployee` as soon as the user leaves it, mirroring the inline cells
 * in the table so the two editing modes stay consistent. No Save button.
 *
 * Modal behavior:
 * - Bumps `modalOpenCount` on the ui-store for its whole lifetime so global
 *   keyboard shortcuts (Escape, M/R nav, tool hotkeys) stand down while the
 *   drawer owns focus.
 * - Escape / backdrop click closes; Tab/Shift+Tab wrap within the drawer.
 * - First focusable input (email) is focused on mount for keyboard users.
 *
 * Fields use `defaultValue` (uncontrolled) for submit-on-blur ergonomics.
 * The parent MUST pass `key={employeeId}` so switching rows forces a fresh
 * mount and `defaultValue` re-reads the new employee — otherwise the stale
 * previous record lingers until the user focuses each field.
 */
export function RosterDetailDrawer({ employeeId, onClose }: Props) {
  const employee = useEmployeeStore((s) => s.employees[employeeId])
  const employees = useEmployeeStore((s) => s.employees)
  const updateEmployee = useEmployeeStore((s) => s.updateEmployee)
  const floors = useFloorStore((s) => s.floors)
  const registerModalOpen = useUIStore((s) => s.registerModalOpen)
  const registerModalClose = useUIStore((s) => s.registerModalClose)
  const canEdit = useCan('editRoster')
  const canViewHistory = useCan('viewSeatHistory')
  const [historyOpen, setHistoryOpen] = useState(false)

  const drawerRef = useRef<HTMLElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  // Keep the ref in sync with the latest onClose without forcing
  // consumers to memoize it. Updating inside an effect is the
  // React-approved pattern; writing during render trips the lint
  // check because concurrent rendering may discard the render.
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Register as an open modal so `useKeyboardShortcuts` stops reacting to
  // global Escape/hotkeys. We also listen locally for Escape and Tab so the
  // drawer doesn't depend on any other handler running.
  useEffect(() => {
    registerModalOpen()
    return () => registerModalClose()
  }, [registerModalOpen, registerModalClose])

  // Autofocus the first field (Name) on mount so keyboard users land
  // inside the drawer immediately. Also select the current value so the
  // `+ Add person` flow can just start typing to replace the "New person"
  // placeholder — no manual backspace.
  useEffect(() => {
    firstFieldRef.current?.focus()
    firstFieldRef.current?.select()
  }, [])

  // Escape closes; Tab/Shift+Tab wrap within the drawer so focus never
  // escapes into the dimmed underlay behind us.
  const onRootKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // `stopPropagation` is mostly belt-and-braces — `useKeyboardShortcuts`
      // already bails when `modalOpenCount > 0` — but it protects against
      // any non-modal-aware listener that might sit between us and window
      // (e.g. a future Konva canvas shortcut on the MapView underneath).
      e.stopPropagation()
      e.preventDefault()
      onCloseRef.current()
      return
    }
    if (e.key !== 'Tab') return
    const root = drawerRef.current
    if (!root) return
    // Selector mirrors the set browsers consider sequentially focusable:
    // standard form controls, links, `tabindex`-adorned nodes, plus the
    // often-overlooked `summary` (disclosure-widget toggle), media
    // elements with user controls, and contenteditable surfaces.
    const focusables = root.querySelectorAll<HTMLElement>(
      [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'summary',
        'audio[controls]',
        'video[controls]',
        '[contenteditable]:not([contenteditable="false"])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', '),
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!employee) return null

  const managerCandidates = Object.values(employees).filter((e) => e.id !== employee.id)
  const seatFloor = employee.floorId ? floors.find((f) => f.id === employee.floorId) : null
  // Resolve the human seat label ("1", "Reception"…) from the canvas
  // element — `employee.seatId` is the element's nanoid, which the user
  // doesn't want to see. Look inside the owning floor's elements map and
  // read `deskId`. Stale references (element deleted but employee not
  // unassigned) fall back to a short truncation downstream.
  const seatLabel: string | null =
    employee.seatId && seatFloor
      ? ((seatFloor.elements[employee.seatId] as { deskId?: string } | undefined)
          ?.deskId ?? null)
      : null
  // `managerId` may point to a now-deleted employee if an older export was
  // re-imported, or if the cascading cleanup in `deleteEmployee` was
  // bypassed. Flag the condition so the user can clear it — a phantom
  // dropdown value would otherwise silently propagate into future exports.
  const danglingManager =
    !!employee.managerId && !employees[employee.managerId]

  const toggleOfficeDay = (day: string) => {
    const has = employee.officeDays.includes(day)
    updateEmployee(employee.id, {
      officeDays: has
        ? employee.officeDays.filter((d) => d !== day)
        : [...employee.officeDays, day],
    })
  }

  const onTagsBlur = (value: string) => {
    const tags = value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    updateEmployee(employee.id, { tags })
  }

  const onEquipmentNeedsBlur = (value: string) => {
    const needs = value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    updateEmployee(employee.id, { equipmentNeeds: needs })
  }

  return (
    <div className="fixed inset-0 z-40 flex" onKeyDown={onRootKeyDown}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className="relative ml-auto w-[420px] max-w-full h-full bg-white shadow-2xl overflow-y-auto flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${employee.name}`}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-400">Editing</div>
            <h2 className="text-base font-semibold text-gray-900">{employee.name || 'New person'}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 px-5 py-4 space-y-4">
          {/*
            Name is the first — and required — field. The old drawer
            started at Email, which meant `+ Add person` routed the user
            past the one thing they actually needed to type first. First
            render selects the text so typing immediately replaces the
            placeholder ("New person") without a manual backspace.
          */}
          <Field label="Name">
            <input
              ref={firstFieldRef}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              defaultValue={employee.name}
              onBlur={(e) => {
                const trimmed = e.target.value.trim()
                // Name is required. An empty commit would corrupt sort /
                // filter indexes (name is a primary sort key); fall back
                // to the stored value and let the next edit re-try.
                if (trimmed && trimmed !== employee.name) {
                  updateEmployee(employee.id, { name: trimmed })
                } else if (!trimmed) {
                  e.target.value = employee.name
                }
              }}
              required
              aria-required="true"
              disabled={!canEdit}
            />
          </Field>
          <Field label="Email">
            <input
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              defaultValue={employee.email}
              onBlur={(e) =>
                updateEmployee(employee.id, { email: e.target.value.trim() })
              }
              type="email"
              disabled={!canEdit}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Team">
              <input
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                defaultValue={employee.team ?? ''}
                onBlur={(e) =>
                  updateEmployee(employee.id, { team: e.target.value.trim() || null })
                }
                disabled={!canEdit}
              />
            </Field>
            <Field label="Type">
              <select
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                value={employee.employmentType}
                onChange={(e) =>
                  updateEmployee(employee.id, {
                    employmentType: e.target.value as Employee['employmentType'],
                  })
                }
                disabled={!canEdit}
              >
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Manager">
            <div className="space-y-1">
              <select
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                value={danglingManager ? '' : (employee.managerId ?? '')}
                onChange={(e) => {
                  const candidate = e.target.value || null
                  const cycle = findManagerCycle(employees, employee.id, candidate)
                  if (cycle) {
                    // Rendering the loop as "A → B → A" (not the raw ids)
                    // is what makes the toast actionable — the user needs
                    // the human names to find the right record to fix.
                    const names = cycle
                      .map((id) => employees[id]?.name ?? id)
                      .join(' → ')
                    useToastStore.getState().push({
                      tone: 'error',
                      title: 'Would create a management loop',
                      body: names,
                    })
                    return
                  }
                  updateEmployee(employee.id, { managerId: candidate })
                }}
                disabled={!canEdit}
              >
                <option value="">— none —</option>
                {managerCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {danglingManager && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  <span className="inline-flex items-center gap-1">
                    <AlertCircle size={12} /> Former manager — no longer in roster
                  </span>
                  <button
                    type="button"
                    onClick={() => updateEmployee(employee.id, { managerId: null })}
                    className="text-amber-900 underline hover:no-underline disabled:opacity-40 disabled:no-underline"
                    disabled={!canEdit}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </Field>

          <Field label="Office days">
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {OFFICE_DAYS.map((day) => {
                  const active = employee.officeDays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleOfficeDay(day)}
                      disabled={!canEdit}
                      className={`px-2 py-1 text-xs font-medium rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
              {/*
                Preset buttons — one-tap apply of the patterns HR reaches
                for on 80% of new hires. We compare against the current
                `officeDays` so the active preset reads as pressed; this is
                cheap and keeps the two controls from drifting.
              */}
              <div className="flex flex-wrap gap-1">
                {OFFICE_DAY_PRESETS.map((preset) => {
                  const matches =
                    preset.days.length === employee.officeDays.length &&
                    preset.days.every((d) => employee.officeDays.includes(d))
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        updateEmployee(employee.id, { officeDays: preset.days })
                      }
                      disabled={!canEdit}
                      className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        matches
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                      title={
                        preset.days.length === 0
                          ? 'Clear office days (remote)'
                          : `Set to ${preset.days.join(', ')}`
                      }
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                type="date"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                defaultValue={employee.startDate ?? ''}
                onBlur={(e) =>
                  updateEmployee(employee.id, { startDate: e.target.value || null })
                }
                disabled={!canEdit}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                defaultValue={employee.endDate ?? ''}
                onBlur={(e) =>
                  updateEmployee(employee.id, { endDate: e.target.value || null })
                }
                disabled={!canEdit}
              />
            </Field>
            <Field label="Departure date">
              <input
                type="date"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                defaultValue={employee.departureDate ?? ''}
                onBlur={(e) =>
                  updateEmployee(employee.id, { departureDate: e.target.value || null })
                }
                disabled={!canEdit}
              />
            </Field>
          </div>

          <Field label="Tags (comma-separated)">
            <input
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              defaultValue={employee.tags.join(', ')}
              onBlur={(e) => onTagsBlur(e.target.value)}
              disabled={!canEdit}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Equipment needs">
              <input
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                defaultValue={employee.equipmentNeeds.join(', ')}
                onBlur={(e) => onEquipmentNeedsBlur(e.target.value)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Equipment status">
              <select
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                value={employee.equipmentStatus}
                onChange={(e) =>
                  updateEmployee(employee.id, {
                    equipmentStatus: e.target.value as Employee['equipmentStatus'],
                  })
                }
                disabled={!canEdit}
              >
                {EQUIPMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Photo URL">
            <input
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              defaultValue={employee.photoUrl ?? ''}
              onBlur={(e) =>
                updateEmployee(employee.id, { photoUrl: e.target.value.trim() || null })
              }
              disabled={!canEdit}
            />
          </Field>

          <Field label="Status">
            <select
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              value={employee.status}
              onChange={(e) =>
                updateEmployee(employee.id, { status: e.target.value as EmployeeStatus })
              }
              disabled={!canEdit}
            >
              {EMPLOYEE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          {employee.status === 'on-leave' && (
            <>
              <Field label="Leave type">
                <select
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  value={employee.leaveType ?? ''}
                  onChange={(e) =>
                    updateEmployee(employee.id, {
                      leaveType: (e.target.value || null) as LeaveType | null,
                    })
                  }
                  disabled={!canEdit}
                >
                  <option value="">—</option>
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>

              <Field label="Expected return">
                <input
                  type="date"
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  defaultValue={employee.expectedReturnDate ?? ''}
                  onChange={(e) =>
                    updateEmployee(employee.id, {
                      expectedReturnDate: e.target.value || null,
                    })
                  }
                  disabled={!canEdit}
                />
              </Field>

              <Field label="Coverage">
                <input
                  list="coverage-employees"
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  defaultValue={employees[employee.coverageEmployeeId ?? '']?.name ?? ''}
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    const matched = name
                      ? Object.values(employees).find((x) => x.id !== employee.id && x.name === name)
                      : null
                    updateEmployee(employee.id, { coverageEmployeeId: matched?.id ?? null })
                  }}
                  disabled={!canEdit}
                  placeholder="Search by name"
                />
                <datalist id="coverage-employees">
                  {Object.values(employees)
                    .filter((e) => e.id !== employee.id)
                    .map((e) => (
                      <option key={e.id} value={e.name} />
                    ))}
                </datalist>
              </Field>

              <Field label="Leave notes">
                <textarea
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 resize-y"
                  defaultValue={employee.leaveNotes ?? ''}
                  onBlur={(e) =>
                    updateEmployee(employee.id, { leaveNotes: e.target.value || null })
                  }
                  disabled={!canEdit}
                  rows={3}
                />
              </Field>
            </>
          )}

          <AccommodationsField
            employee={employee}
            canEdit={canEdit}
            onChange={(accommodations) =>
              updateEmployee(employee.id, { accommodations })
            }
          />

          <ScheduledStatusChanges
            employee={employee}
            canEdit={canEdit}
            onChange={(next) =>
              updateEmployee(employee.id, { pendingStatusChanges: next })
            }
          />

          <Field label="Seat">
            <div className="text-sm text-gray-600 px-2 py-1.5 bg-gray-50 rounded border border-gray-100">
              {employee.seatId && seatFloor
                ? `${seatFloor.name} / ${seatLabel ?? employee.seatId.slice(0, 4)}`
                : 'Unassigned'}
            </div>
            {canViewHistory && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="mt-1 text-xs text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline"
                data-testid="roster-seat-history-link"
              >
                Seat history
              </button>
            )}
          </Field>
        </div>
      </aside>
      {historyOpen && (
        <SeatHistoryDrawer
          target={{ kind: 'employee', employeeId: employee.id }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      {children}
    </label>
  )
}

/**
 * Accommodations editor — the one place where HR sets structured ADA /
 * dignity-of-work metadata on an employee. Existing entries render as
 * removable chips (icon + label + × button; notes surface as the chip's
 * `title` tooltip). New entries are added via a small type picker + notes
 * input below the list.
 *
 * `nanoid` drives the entry id — same generator as desks, employees, and
 * floors, so we don't introduce a second id convention just for this
 * field. The `+ Add` button is disabled until a valid type is picked so
 * an accidental click can't persist a junk row.
 */
function AccommodationsField({
  employee,
  canEdit,
  onChange,
}: {
  employee: Employee
  canEdit: boolean
  onChange: (accommodations: Accommodation[]) => void
}) {
  const [type, setType] = useState<AccommodationType | ''>('')
  const [notes, setNotes] = useState('')

  const existing = employee.accommodations ?? []

  const handleAdd = () => {
    if (!type) return
    const entry: Accommodation = {
      id: nanoid(),
      type,
      notes: notes.trim() || null,
      createdAt: new Date().toISOString(),
    }
    onChange([...existing, entry])
    setType('')
    setNotes('')
  }

  const handleRemove = (id: string) => {
    onChange(existing.filter((a) => a.id !== id))
  }

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
        Accommodations
      </div>

      {existing.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-2" data-testid="accommodations-list">
          {existing.map((a) => {
            const Icon = ACCOMMODATION_ICONS[a.type]
            return (
              <span
                key={a.id}
                data-testid={`accommodation-chip-${a.type}`}
                title={a.notes ?? ACCOMMODATION_LABELS[a.type]}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-full"
              >
                <Icon size={12} aria-hidden="true" />
                <span>{ACCOMMODATION_LABELS[a.type]}</span>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Remove ${ACCOMMODATION_LABELS[a.type]}`}
                    onClick={() => handleRemove(a.id)}
                    className="ml-0.5 text-indigo-600 hover:text-indigo-900"
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      ) : (
        <div className="text-xs text-gray-400 italic mb-2">None</div>
      )}

      {canEdit && (
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Accommodation type"
            className="flex-shrink-0 px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={type}
            onChange={(e) => setType((e.target.value as AccommodationType) || '')}
          >
            <option value="">— choose —</option>
            {ACCOMMODATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOMMODATION_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            aria-label="Accommodation notes"
            className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!type}
            className="flex-shrink-0 px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Forward-dated status changes for one employee. Shows the current
 * queue (sorted ascending), with an inline remove control, and an
 * "add" row for scheduling a new transition.
 *
 * The parent owns persistence — we emit the updated array via
 * `onChange` and trust the store + autosave loop to flush. Past dates
 * are rejected in the UI (Schedule disabled + helper text) because the
 * commit routine would fire it immediately and the user almost always
 * means "today forward".
 */
function ScheduledStatusChanges({
  employee,
  canEdit,
  onChange,
}: {
  employee: Employee
  canEdit: boolean
  onChange: (next: PendingStatusChange[]) => void
}) {
  const [draftDate, setDraftDate] = useState('')
  const [draftStatus, setDraftStatus] = useState<EmployeeStatus>('on-leave')
  const [draftNote, setDraftNote] = useState('')
  const today = todayIsoDate()
  const isPastDate = draftDate !== '' && draftDate < today

  const changes = employee.pendingStatusChanges ?? []

  const handleAdd = () => {
    if (!canEdit) return
    if (!draftDate || isPastDate) return
    const entry: PendingStatusChange = {
      id: nanoid(),
      status: draftStatus,
      effectiveDate: draftDate,
      note: draftNote.trim() || null,
      createdAt: new Date().toISOString(),
    }
    const next = [...changes, entry].sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate),
    )
    onChange(next)
    setDraftDate('')
    setDraftNote('')
  }

  const handleRemove = (id: string) => {
    if (!canEdit) return
    onChange(changes.filter((c) => c.id !== id))
  }

  const addDisabled = !canEdit || !draftDate || isPastDate

  return (
    <Field label="Scheduled changes">
      <div className="space-y-1.5">
        {changes.length === 0 ? (
          <div className="text-xs text-gray-400 italic">No scheduled changes.</div>
        ) : (
          <ul className="space-y-1">
            {changes.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1"
              >
                <span className="text-gray-700">
                  <span className="font-mono text-gray-500">[{c.effectiveDate}]</span>{' '}
                  → <span className="font-medium">{c.status}</span>
                  {c.note ? (
                    <span className="text-gray-500"> ({c.note})</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(c.id)}
                  disabled={!canEdit}
                  className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                  aria-label={`Remove scheduled change for ${c.effectiveDate}`}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            className="px-1.5 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            min={today}
            disabled={!canEdit}
            aria-label="Effective date"
          />
          <select
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value as EmployeeStatus)}
            className="px-1.5 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            disabled={!canEdit}
            aria-label="New status"
          >
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="text"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            className="flex-1 min-w-0 px-1.5 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
            placeholder="Note (optional)"
            disabled={!canEdit}
            aria-label="Note"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={addDisabled}
            className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Schedule
          </button>
        </div>
        {isPastDate && (
          <div className="text-[11px] text-amber-700">
            Pick today or a future date.
          </div>
        )}
      </div>
    </Field>
  )
}
