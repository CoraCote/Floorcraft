import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useUIStore } from '../../stores/uiStore'
import type { Employee, EmployeeStatus } from '../../types/employee'
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES } from '../../types/employee'

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

  // Autofocus the first field on mount so keyboard users land inside the
  // drawer immediately. Done in an effect (not autoFocus prop) so it runs
  // after layout and works with the transition.
  useEffect(() => {
    firstFieldRef.current?.focus()
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
          <Field label="Email">
            <input
              ref={firstFieldRef}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue={employee.email}
              onBlur={(e) =>
                updateEmployee(employee.id, { email: e.target.value.trim() })
              }
              type="email"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Team">
              <input
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                defaultValue={employee.team ?? ''}
                onBlur={(e) =>
                  updateEmployee(employee.id, { team: e.target.value.trim() || null })
                }
              />
            </Field>
            <Field label="Type">
              <select
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={employee.employmentType}
                onChange={(e) =>
                  updateEmployee(employee.id, {
                    employmentType: e.target.value as Employee['employmentType'],
                  })
                }
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
            <select
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={employee.managerId ?? ''}
              onChange={(e) =>
                updateEmployee(employee.id, { managerId: e.target.value || null })
              }
            >
              <option value="">— none —</option>
              {managerCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Office days">
            <div className="flex gap-1">
              {OFFICE_DAYS.map((day) => {
                const active = employee.officeDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleOfficeDay(day)}
                    className={`px-2 py-1 text-xs font-medium rounded border transition-colors ${
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
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                type="date"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                defaultValue={employee.startDate ?? ''}
                onBlur={(e) =>
                  updateEmployee(employee.id, { startDate: e.target.value || null })
                }
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                defaultValue={employee.endDate ?? ''}
                onBlur={(e) =>
                  updateEmployee(employee.id, { endDate: e.target.value || null })
                }
              />
            </Field>
          </div>

          <Field label="Tags (comma-separated)">
            <input
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue={employee.tags.join(', ')}
              onBlur={(e) => onTagsBlur(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Equipment needs">
              <input
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                defaultValue={employee.equipmentNeeds.join(', ')}
                onBlur={(e) => onEquipmentNeedsBlur(e.target.value)}
              />
            </Field>
            <Field label="Equipment status">
              <select
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={employee.equipmentStatus}
                onChange={(e) =>
                  updateEmployee(employee.id, {
                    equipmentStatus: e.target.value as Employee['equipmentStatus'],
                  })
                }
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
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue={employee.photoUrl ?? ''}
              onBlur={(e) =>
                updateEmployee(employee.id, { photoUrl: e.target.value.trim() || null })
              }
            />
          </Field>

          <Field label="Status">
            <select
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={employee.status}
              onChange={(e) =>
                updateEmployee(employee.id, { status: e.target.value as EmployeeStatus })
              }
            >
              {EMPLOYEE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Seat">
            <div className="text-sm text-gray-600 px-2 py-1.5 bg-gray-50 rounded border border-gray-100">
              {employee.seatId && seatFloor
                ? `${seatFloor.name} / ${employee.seatId}`
                : 'Unassigned'}
            </div>
          </Field>
        </div>
      </aside>
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
