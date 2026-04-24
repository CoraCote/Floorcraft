import { useState } from 'react'
import { History } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { NeighborhoodPropertiesPanel } from './NeighborhoodPropertiesPanel'
import { unassignEmployee, deleteElements } from '../../../lib/seatAssignment'
import { alignElements, distributeElements } from '../../../lib/alignment'
import { validateDeskId } from '../../../lib/deskIdValidation'
import { useCan } from '../../../hooks/useCan'
import { SeatHistoryDrawer } from '../SeatHistoryDrawer'
import {
  EMPLOYEE_STATUS_PILL_CLASSES,
  type Employee,
  type EmployeeStatus,
} from '../../../types/employee'
import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from 'lucide-react'
import {
  isTableElement,
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isConferenceRoomElement,
  isCommonAreaElement,
  isWallElement,
  WALL_TYPES,
} from '../../../types/elements'
import { computeSeatPositions } from '../../../lib/seatLayout'
import type { TableElement, WorkstationElement, ConferenceRoomElement, CommonAreaElement, WallElement, DeskElement, PrivateOfficeElement, WallType } from '../../../types/elements'
import { SEAT_STATUS_OVERRIDES, type SeatStatus } from '../../../types/seatAssignment'

const WALL_TYPE_LABELS: Record<WallType, string> = {
  solid: 'Solid (drywall)',
  glass: 'Glass partition',
  'half-height': 'Half-height',
  demountable: 'Demountable',
}

/**
 * Controlled desk-id editor with on-blur uniqueness validation.
 *
 * Why local state: committing every keystroke lets collisions briefly
 * exist in the store, which would trip `assignEmployee` lookups and make
 * undo/redo noisy. Local state lets the user type freely; we only commit
 * on blur once the value passes `validateDeskId`. Invalid values stay
 * visible with a red error message so the user knows why the field didn't
 * save, and a `blur` without correction reverts to the stored value.
 */
function DeskIdInput({
  elementId,
  value,
  disabled,
}: {
  elementId: string
  value: string
  disabled?: boolean
}) {
  const updateElement = useElementsStore((s) => s.updateElement)
  const elements = useElementsStore((s) => s.elements)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  // Track prior props so we can reset local draft state when the store
  // value changes out from under us (undo/redo, selection swap). React's
  // recommended pattern for deriving state from props, per
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders —
  // avoids the "setState in an effect" anti-pattern the linter flags.
  const [prevValue, setPrevValue] = useState(value)
  const [prevElementId, setPrevElementId] = useState(elementId)
  if (prevValue !== value || prevElementId !== elementId) {
    setPrevValue(value)
    setPrevElementId(elementId)
    setDraft(value)
    setError(null)
  }

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Desk ID</label>
      <input
        className={`w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 ${
          error ? 'border-red-300' : 'border-gray-200 dark:border-gray-800'
        } disabled:bg-gray-50 disabled:text-gray-500`}
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value)
          // Live-validate so the user sees the warning before blurring.
          setError(validateDeskId(e.target.value, elementId, elements))
        }}
        onBlur={() => {
          const problem = validateDeskId(draft, elementId, elements)
          if (problem) {
            // Revert the visible draft to the last-known-good store value
            // so the user doesn't think their typo silently saved.
            setDraft(value)
            setError(null)
            return
          }
          const trimmed = draft.trim()
          if (trimmed !== value) {
            updateElement(elementId, { deskId: trimmed })
          }
          setError(null)
        }}
      />
      {error && <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</div>}
    </div>
  )
}

/**
 * Opt-in override for a seat's status. The default (`assigned` when someone
 * is on it, `unassigned` otherwise) is derived from the assignment and
 * isn't offered here — picking one of those in a dropdown and then
 * assigning/clearing somebody would desync the two truths. Only the three
 * real overrides (`reserved`, `hot-desk`, `decommissioned`) plus "none" are
 * surfaced.
 */
function SeatStatusOverridePicker({
  elementId,
  value,
  disabled,
}: {
  elementId: string
  value: SeatStatus | undefined
  disabled?: boolean
}) {
  const updateElement = useElementsStore((s) => s.updateElement)
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
        Seat status override
      </label>
      <select
        className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500 bg-white dark:bg-gray-900"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value
          // `undefined` (cleared) removes the key so the derivation kicks
          // back in. Setting `null` would persist an explicit null through
          // autosave, which is noisier than absence.
          updateElement(elementId, {
            seatStatus: v ? (v as SeatStatus) : undefined,
          } as Partial<DeskElement | WorkstationElement | PrivateOfficeElement>)
        }}
      >
        <option value="">None (derive from assignment)</option>
        {SEAT_STATUS_OVERRIDES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * Short status labels used inside the employee detail card chip. Kept
 * local so the file has no non-component exports (which would trip the
 * `react-refresh/only-export-components` lint rule).
 */
const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: 'Active',
  'on-leave': 'On leave',
  departed: 'Departed',
  'parental-leave': 'Parental leave',
  sabbatical: 'Sabbatical',
  contractor: 'Contractor',
  intern: 'Intern',
}

/**
 * Compact employee profile block rendered at the top of the desk /
 * hot-desk properties branch whenever the selected seat has an assigned
 * employee. Replaces the earlier canvas-overlay popover — surfacing the
 * same avatar, chips, and actions inside the 320px sidebar so the canvas
 * stays clear for editing.
 *
 * Redaction: when the viewer lacks `viewPII`, `useVisibleEmployees`
 * already projects the store through `redactEmployee`, so we can trust
 * the passed `employee` record. We still show explicit
 * "— (redacted)" placeholders for the email + manager rows so the viewer
 * knows the field was withheld (vs. missing).
 */
function EmployeeDetailCard({
  employee,
  canViewPII,
  canEditRoster,
}: {
  employee: Employee
  canViewPII: boolean
  canEditRoster: boolean
}) {
  const navigate = useNavigate()
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const rawEmployees = useEmployeeStore((s) => s.employees)
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)

  const initials = employee.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const deptColor = employee.department
    ? getDepartmentColor(employee.department)
    : '#9CA3AF'

  // Manager lookup: redaction blanks `managerId`, so when `viewPII=false`
  // this naturally skips the real manager and we render the redacted
  // placeholder instead. Under `viewPII=true`, we still need the raw
  // store (not the redacted projection) to fetch the manager's name.
  const manager =
    canViewPII && employee.managerId && rawEmployees[employee.managerId]
      ? rawEmployees[employee.managerId]
      : null

  const handleUnassign = () => {
    unassignEmployee(employee.id)
  }

  const handleViewProfile = () => {
    if (teamSlug && officeSlug) {
      navigate(`/t/${teamSlug}/o/${officeSlug}/roster?focus=${employee.id}`)
    }
  }

  return (
    <div
      data-testid="employee-detail-card"
      className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2"
    >
      {/* Header: avatar + name + title */}
      <div className="flex items-center gap-2 min-w-0">
        {employee.photoUrl ? (
          <img
            src={employee.photoUrl}
            alt=""
            width={36}
            height={36}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            aria-hidden
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
            style={{ background: deptColor }}
          >
            {initials || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate"
            title={employee.name}
          >
            {employee.name || '—'}
          </div>
          {employee.title && (
            <div
              className="text-xs text-gray-500 dark:text-gray-400 truncate"
              title={employee.title}
            >
              {employee.title}
            </div>
          )}
        </div>
      </div>

      {/* Chips: department + status */}
      <div className="flex gap-1.5 flex-wrap">
        {employee.department && (
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
            style={{ background: deptColor }}
          >
            {employee.department}
          </span>
        )}
        <span
          data-testid="status-chip"
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${EMPLOYEE_STATUS_PILL_CLASSES[employee.status]}`}
        >
          {EMPLOYEE_STATUS_LABEL[employee.status]}
        </span>
      </div>

      {/* Info rows */}
      <div className="grid grid-cols-[60px_1fr] gap-x-2 gap-y-0.5 text-[12px] text-gray-700 dark:text-gray-200">
        <div className="text-[11px] text-gray-400 dark:text-gray-500">Team</div>
        <div className="truncate" title={employee.team || '—'}>
          {employee.team || '—'}
        </div>
        <div className="text-[11px] text-gray-400 dark:text-gray-500">Manager</div>
        <div
          className="truncate"
          title={canViewPII ? manager?.name || '—' : '— (redacted)'}
        >
          {canViewPII ? manager?.name || '—' : '— (redacted)'}
        </div>
        <div className="text-[11px] text-gray-400 dark:text-gray-500">Email</div>
        <div
          className="truncate"
          title={canViewPII ? employee.email || '—' : '— (redacted)'}
        >
          {canViewPII ? employee.email || '—' : '— (redacted)'}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 justify-end pt-1">
        {canEditRoster && (
          <button
            type="button"
            onClick={handleUnassign}
            data-testid="employee-detail-unassign"
            className="px-2.5 py-1 text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            Unassign
          </button>
        )}
        <button
          type="button"
          onClick={handleViewProfile}
          data-testid="employee-detail-view-profile"
          className="px-2.5 py-1 text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          View profile
        </button>
      </div>
    </div>
  )
}

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  // Display-layer read — the assigned-employee name preview in the Desk
  // section should go through redaction when the viewer lacks `viewPII`.
  const employees = useVisibleEmployees()
  const neighborhoods = useNeighborhoodStore((s) => s.neighborhoods)
  const canEdit = useCan('editMap')
  const canViewHistory = useCan('viewSeatHistory')
  // Read these unconditionally at the top so the hook call order is
  // stable — combining them with `||` would short-circuit the second
  // call and violate rules-of-hooks on re-render.
  const canViewPII = useCan('viewPII')
  const canEditRoster = useCan('editRoster')
  const inputDisabled = !canEdit
  // Locally owned drawer target — the panel unmounts on selection change
  // (key'd by element id higher up), which cleans this up automatically.
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null)

  // If the single selected id belongs to a neighborhood (not an element),
  // delegate to the dedicated neighborhood panel. Neighborhoods live in
  // their own store, so `elements[id]` will be undefined — we can't rely
  // on the existing fall-through code to render them.
  if (selectedIds.length === 1 && neighborhoods[selectedIds[0]]) {
    return <NeighborhoodPropertiesPanel id={selectedIds[0]} />
  }

  if (selectedIds.length === 0) {
    return <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Select an element to see its properties</div>
  }

  if (selectedIds.length > 1) {
    const selectedEls = selectedIds
      .map((id) => elements[id])
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
    const allWalls = selectedEls.length > 0 && selectedEls.every(isWallElement)
    // For the shared controls we seed the inputs from the first wall; edits
    // always broadcast to the full selection so a mixed-value display is an
    // acceptable simplification (common in pro editors like Figma).
    const firstWall = allWalls ? (selectedEls[0] as WallElement) : null

    const alignBtn = (label: string, onClick: () => void, Icon: typeof AlignHorizontalJustifyStart) => (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={inputDisabled}
        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon size={16} />
      </button>
    )

    return (
      <div className="flex flex-col gap-4">
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          {selectedIds.length} elements selected
        </div>

        {/* Alignment + distribution. Distribution needs ≥3 elements, so the
            distribution buttons disable below that count but stay visible
            so the toolbar layout doesn't jump. */}
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Align</div>
          <div className="flex items-center gap-1 flex-wrap">
            {alignBtn('Align left', () => alignElements(selectedIds, 'left'), AlignHorizontalJustifyStart)}
            {alignBtn('Align horizontal center', () => alignElements(selectedIds, 'h-center'), AlignHorizontalJustifyCenter)}
            {alignBtn('Align right', () => alignElements(selectedIds, 'right'), AlignHorizontalJustifyEnd)}
            {alignBtn('Align top', () => alignElements(selectedIds, 'top'), AlignVerticalJustifyStart)}
            {alignBtn('Align vertical center', () => alignElements(selectedIds, 'v-center'), AlignVerticalJustifyCenter)}
            {alignBtn('Align bottom', () => alignElements(selectedIds, 'bottom'), AlignVerticalJustifyEnd)}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Distribute</div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              aria-label="Distribute horizontally"
              title="Distribute horizontally"
              onClick={() => distributeElements(selectedIds, 'horizontal')}
              disabled={selectedIds.length < 3 || inputDisabled}
              className="p-1.5 rounded text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <AlignHorizontalSpaceAround size={16} />
            </button>
            <button
              type="button"
              aria-label="Distribute vertically"
              title="Distribute vertically"
              onClick={() => distributeElements(selectedIds, 'vertical')}
              disabled={selectedIds.length < 3 || inputDisabled}
              className="p-1.5 rounded text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <AlignVerticalSpaceAround size={16} />
            </button>
          </div>
        </div>

        {allWalls && firstWall && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Thickness</label>
              <input
                type="number"
                min={2}
                max={20}
                step={1}
                className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
                value={firstWall.thickness}
                disabled={inputDisabled}
                onChange={(e) => {
                  const t = Number(e.target.value)
                  for (const id of selectedIds) updateElement(id, { thickness: t } as Partial<WallElement>)
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Line style</label>
              <select
                aria-label="Line style"
                className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
                value={firstWall.dashStyle ?? 'solid'}
                disabled={inputDisabled}
                onChange={(e) => {
                  const v = e.target.value as 'solid' | 'dashed' | 'dotted'
                  for (const id of selectedIds) updateElement(id, { dashStyle: v } as Partial<WallElement>)
                }}
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Wall type</label>
              <select
                aria-label="Wall type"
                className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
                value={firstWall.wallType ?? 'solid'}
                disabled={inputDisabled}
                onChange={(e) => {
                  const v = e.target.value as WallType
                  for (const id of selectedIds) updateElement(id, { wallType: v } as Partial<WallElement>)
                }}
              >
                {WALL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WALL_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Stroke</label>
              <input
                type="color"
                className="w-full h-8 border border-gray-200 dark:border-gray-800 rounded cursor-pointer disabled:opacity-50"
                value={firstWall.style.stroke}
                disabled={inputDisabled}
                onChange={(e) => {
                  for (const id of selectedIds) {
                    const el = elements[id]
                    if (!el) continue
                    updateElement(id, { style: { ...el.style, stroke: e.target.value } })
                  }
                }}
              />
            </div>
          </>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => {
              deleteElements(selectedIds)
              useUIStore.getState().clearSelection()
            }}
            className="mt-2 w-full px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            Delete {selectedIds.length} elements
          </button>
        )}
      </div>
    )
  }

  const el = elements[selectedIds[0]]
  if (!el) return null

  const update = (updates: Record<string, unknown>) => updateElement(el.id, updates)

  // Helper to find assigned employee name for desk/private-office
  const getAssignedEmployeeName = (employeeId: string | null): string | null => {
    if (!employeeId) return null
    const emp = employees[employeeId]
    return emp ? emp.name : null
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Label</label>
        <input
          className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={el.label}
          disabled={inputDisabled}
          onChange={(e) => update({ label: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">X</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(el.x)}
            disabled={inputDisabled}
            onChange={(e) => update({ x: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Y</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(el.y)}
            disabled={inputDisabled}
            onChange={(e) => update({ y: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Width</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(el.width)}
            disabled={inputDisabled}
            onChange={(e) => update({ width: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Height</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(el.height)}
            disabled={inputDisabled}
            onChange={(e) => update({ height: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Rotation</label>
        <input
          type="number"
          className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={Math.round(el.rotation)}
          disabled={inputDisabled}
          onChange={(e) => update({ rotation: Number(e.target.value) % 360 })}
          min={0}
          max={359}
        />
      </div>

      {isWallElement(el) ? (
        // Walls don't fill — only the stroke is meaningful. Hiding Fill
        // prevents users from setting a value with no visual effect.
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Stroke</label>
          <input
            type="color"
            className="w-full h-8 border border-gray-200 dark:border-gray-800 rounded cursor-pointer disabled:opacity-50"
            value={el.style.stroke}
            disabled={inputDisabled}
            onChange={(e) => update({ style: { ...el.style, stroke: e.target.value } })}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Fill</label>
            <input
              type="color"
              className="w-full h-8 border border-gray-200 dark:border-gray-800 rounded cursor-pointer disabled:opacity-50"
              value={el.style.fill}
              disabled={inputDisabled}
              onChange={(e) => update({ style: { ...el.style, fill: e.target.value } })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Stroke</label>
            <input
              type="color"
              className="w-full h-8 border border-gray-200 dark:border-gray-800 rounded cursor-pointer disabled:opacity-50"
              value={el.style.stroke}
              disabled={inputDisabled}
              onChange={(e) => update({ style: { ...el.style, stroke: e.target.value } })}
            />
          </div>
        </div>
      )}

      {/* Wall-specific controls: thickness + dash pattern. */}
      {isWallElement(el) && (
        <>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Thickness</label>
            <input
              type="number"
              min={2}
              max={20}
              step={1}
              className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              value={el.thickness}
              disabled={inputDisabled}
              onChange={(e) => update({ thickness: Number(e.target.value) } as Partial<WallElement>)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Line style</label>
            <select
              aria-label="Line style"
              className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              value={el.dashStyle ?? 'solid'}
              disabled={inputDisabled}
              onChange={(e) =>
                update({ dashStyle: e.target.value as 'solid' | 'dashed' | 'dotted' } as Partial<WallElement>)
              }
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Wall type</label>
            <select
              aria-label="Wall type"
              className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              value={el.wallType ?? 'solid'}
              disabled={inputDisabled}
              onChange={(e) =>
                update({ wallType: e.target.value as WallType } as Partial<WallElement>)
              }
            >
              {WALL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {WALL_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {isTableElement(el) && (
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Seats</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={el.seatCount}
            min={1}
            max={30}
            disabled={inputDisabled}
            onChange={(e) => {
              const count = Number(e.target.value)
              const seats = computeSeatPositions(el.type, count, el.seatLayout, el.width, el.height)
              update({ seatCount: count, seats } as Partial<TableElement>)
            }}
          />
        </div>
      )}

      {/* Desk / Hot-desk properties */}
      {isDeskElement(el) && (
        <>
          {el.assignedEmployeeId && employees[el.assignedEmployeeId] ? (
            <EmployeeDetailCard
              employee={employees[el.assignedEmployeeId]}
              canViewPII={canViewPII}
              canEditRoster={canEditRoster}
            />
          ) : null}
          <DeskIdInput elementId={el.id} value={el.deskId} disabled={inputDisabled} />
          <SeatStatusOverridePicker elementId={el.id} value={el.seatStatus} disabled={inputDisabled} />
          {!el.assignedEmployeeId && (
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Assigned To</label>
              <div className="text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5">
                No one assigned
              </div>
            </div>
          )}
        </>
      )}

      {/* Workstation properties */}
      {isWorkstationElement(el) && (
        <>
          <DeskIdInput elementId={el.id} value={el.deskId} disabled={inputDisabled} />
          <SeatStatusOverridePicker elementId={el.id} value={el.seatStatus} disabled={inputDisabled} />
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Positions</label>
            <input
              type="number"
              className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              value={el.positions}
              min={1}
              max={20}
              disabled={inputDisabled}
              onChange={(e) => {
                const newCount = Number(e.target.value)
                // If shrinking below the number of current assignees, unassign
                // the tail employees so they aren't stranded claiming this
                // workstation with no visible seat.
                if (newCount < el.assignedEmployeeIds.length) {
                  const toRemove = el.assignedEmployeeIds.slice(newCount)
                  toRemove.forEach((empId) => unassignEmployee(empId))
                }
                update({ positions: newCount } as Partial<WorkstationElement>)
              }}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
              Assigned ({el.assignedEmployeeIds.length} / {el.positions})
            </label>
            {el.assignedEmployeeIds.length > 0 ? (
              <div className="flex flex-col gap-1">
                {el.assignedEmployeeIds.map((empId) => (
                  <div key={empId} className="flex items-center justify-between gap-2 text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1">
                    <span className="text-gray-800 dark:text-gray-100 truncate">
                      {getAssignedEmployeeName(empId) || empId}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => {
                          unassignEmployee(empId)
                        }}
                        className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 flex-shrink-0"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5">
                No one assigned
              </div>
            )}
          </div>
        </>
      )}

      {/* Private office properties */}
      {isPrivateOfficeElement(el) && (
        <>
          <DeskIdInput elementId={el.id} value={el.deskId} disabled={inputDisabled} />
          <SeatStatusOverridePicker elementId={el.id} value={el.seatStatus} disabled={inputDisabled} />
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">
              Assigned ({el.assignedEmployeeIds.length} / {el.capacity})
            </label>
            {el.assignedEmployeeIds.length > 0 ? (
              <div className="flex flex-col gap-1">
                {el.assignedEmployeeIds.map((empId) => (
                  <div key={empId} className="flex items-center justify-between gap-2 text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1">
                    <span className="text-gray-800 dark:text-gray-100 truncate">
                      {getAssignedEmployeeName(empId) || empId}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => {
                          unassignEmployee(empId)
                        }}
                        className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 flex-shrink-0"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5">
                No one assigned
              </div>
            )}
          </div>
        </>
      )}

      {/* Conference room properties */}
      {isConferenceRoomElement(el) && (
        <>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Room Name</label>
            <input
              className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              value={el.roomName}
              disabled={inputDisabled}
              onChange={(e) => update({ roomName: e.target.value } as Partial<ConferenceRoomElement>)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Capacity</label>
            <input
              type="number"
              className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              value={el.capacity}
              min={1}
              max={100}
              disabled={inputDisabled}
              onChange={(e) => update({ capacity: Number(e.target.value) } as Partial<ConferenceRoomElement>)}
            />
          </div>
        </>
      )}

      {/* Common area properties */}
      {isCommonAreaElement(el) && (
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Area Name</label>
          <input
            className="w-full text-sm border border-gray-200 dark:border-gray-800 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={el.areaName}
            disabled={inputDisabled}
            onChange={(e) => update({ areaName: e.target.value } as Partial<CommonAreaElement>)}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
        <input
          type="checkbox"
          checked={el.locked}
          disabled={inputDisabled}
          onChange={(e) => update({ locked: e.target.checked })}
          className="rounded"
        />
        Locked
      </label>

      {canViewHistory &&
        (isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el)) && (
          <button
            type="button"
            onClick={() => setHistoryTargetId(el.id)}
            className="mt-2 w-full px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors inline-flex items-center justify-center gap-1.5"
            data-testid="properties-history-button"
          >
            <History size={14} aria-hidden="true" /> History
          </button>
        )}

      {canEdit && selectedIds.length >= 1 && (
        <button
          type="button"
          onClick={() => {
            deleteElements(selectedIds)
            useUIStore.getState().clearSelection()
          }}
          className="mt-2 w-full px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
        >
          {selectedIds.length === 1 ? 'Delete element' : `Delete ${selectedIds.length} elements`}
        </button>
      )}

      {historyTargetId && (
        <SeatHistoryDrawer
          target={{ kind: 'seat', seatId: historyTargetId }}
          onClose={() => setHistoryTargetId(null)}
        />
      )}
    </div>
  )
}
