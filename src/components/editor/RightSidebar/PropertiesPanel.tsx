import { useState } from 'react'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { unassignEmployee, deleteElements } from '../../../lib/seatAssignment'
import { alignElements, distributeElements } from '../../../lib/alignment'
import { validateDeskId } from '../../../lib/deskIdValidation'
import { useCanEdit } from '../../../hooks/useCanEdit'
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
} from '../../../types/elements'
import { computeSeatPositions } from '../../../lib/seatLayout'
import type { TableElement, WorkstationElement, ConferenceRoomElement, CommonAreaElement, WallElement } from '../../../types/elements'

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
      <label className="text-xs font-medium text-gray-500 mb-1 block">Desk ID</label>
      <input
        className={`w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 ${
          error ? 'border-red-300' : 'border-gray-200'
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
      {error && <div className="text-xs text-red-600 mt-0.5">{error}</div>}
    </div>
  )
}

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  const employees = useEmployeeStore((s) => s.employees)
  const canEdit = useCanEdit()
  const inputDisabled = !canEdit

  if (selectedIds.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">Select an element to see its properties</div>
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
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon size={16} />
      </button>
    )

    return (
      <div className="flex flex-col gap-4">
        <div className="text-sm text-gray-500 text-center py-4">
          {selectedIds.length} elements selected
        </div>

        {/* Alignment + distribution. Distribution needs ≥3 elements, so the
            distribution buttons disable below that count but stay visible
            so the toolbar layout doesn't jump. */}
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">Align</div>
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
          <div className="text-xs font-medium text-gray-500 mb-1">Distribute</div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              aria-label="Distribute horizontally"
              title="Distribute horizontally"
              onClick={() => distributeElements(selectedIds, 'horizontal')}
              disabled={selectedIds.length < 3 || inputDisabled}
              className="p-1.5 rounded text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <AlignHorizontalSpaceAround size={16} />
            </button>
            <button
              type="button"
              aria-label="Distribute vertically"
              title="Distribute vertically"
              onClick={() => distributeElements(selectedIds, 'vertical')}
              disabled={selectedIds.length < 3 || inputDisabled}
              className="p-1.5 rounded text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <AlignVerticalSpaceAround size={16} />
            </button>
          </div>
        </div>

        {allWalls && firstWall && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Thickness</label>
              <input
                type="number"
                min={2}
                max={20}
                step={1}
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
                value={firstWall.thickness}
                disabled={inputDisabled}
                onChange={(e) => {
                  const t = Number(e.target.value)
                  for (const id of selectedIds) updateElement(id, { thickness: t } as Partial<WallElement>)
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Line style</label>
              <select
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
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
              <label className="text-xs font-medium text-gray-500 mb-1 block">Stroke</label>
              <input
                type="color"
                className="w-full h-8 border border-gray-200 rounded cursor-pointer disabled:opacity-50"
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
            className="mt-2 w-full px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
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
        <label className="text-xs font-medium text-gray-500 mb-1 block">Label</label>
        <input
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
          value={el.label}
          disabled={inputDisabled}
          onChange={(e) => update({ label: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">X</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(el.x)}
            disabled={inputDisabled}
            onChange={(e) => update({ x: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Y</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(el.y)}
            disabled={inputDisabled}
            onChange={(e) => update({ y: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Width</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(el.width)}
            disabled={inputDisabled}
            onChange={(e) => update({ width: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Height</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={Math.round(el.height)}
            disabled={inputDisabled}
            onChange={(e) => update({ height: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Rotation</label>
        <input
          type="number"
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
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
          <label className="text-xs font-medium text-gray-500 mb-1 block">Stroke</label>
          <input
            type="color"
            className="w-full h-8 border border-gray-200 rounded cursor-pointer disabled:opacity-50"
            value={el.style.stroke}
            disabled={inputDisabled}
            onChange={(e) => update({ style: { ...el.style, stroke: e.target.value } })}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Fill</label>
            <input
              type="color"
              className="w-full h-8 border border-gray-200 rounded cursor-pointer disabled:opacity-50"
              value={el.style.fill}
              disabled={inputDisabled}
              onChange={(e) => update({ style: { ...el.style, fill: e.target.value } })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Stroke</label>
            <input
              type="color"
              className="w-full h-8 border border-gray-200 rounded cursor-pointer disabled:opacity-50"
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
            <label className="text-xs font-medium text-gray-500 mb-1 block">Thickness</label>
            <input
              type="number"
              min={2}
              max={20}
              step={1}
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              value={el.thickness}
              disabled={inputDisabled}
              onChange={(e) => update({ thickness: Number(e.target.value) } as Partial<WallElement>)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Line style</label>
            <select
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
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
        </>
      )}

      {isTableElement(el) && (
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Seats</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
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
          <DeskIdInput elementId={el.id} value={el.deskId} disabled={inputDisabled} />
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Assigned To</label>
            {el.assignedEmployeeId ? (
              <div className="flex items-center justify-between gap-2 text-sm border border-gray-200 rounded px-2 py-1.5">
                <span className="text-gray-800 truncate">
                  {getAssignedEmployeeName(el.assignedEmployeeId) || el.assignedEmployeeId}
                </span>
                {canEdit && (
                  <button
                    onClick={() => {
                      unassignEmployee(el.assignedEmployeeId!)
                    }}
                    className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400 border border-gray-200 rounded px-2 py-1.5">
                No one assigned
              </div>
            )}
          </div>
        </>
      )}

      {/* Workstation properties */}
      {isWorkstationElement(el) && (
        <>
          <DeskIdInput elementId={el.id} value={el.deskId} disabled={inputDisabled} />
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Positions</label>
            <input
              type="number"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
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
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Assigned ({el.assignedEmployeeIds.length} / {el.positions})
            </label>
            {el.assignedEmployeeIds.length > 0 ? (
              <div className="flex flex-col gap-1">
                {el.assignedEmployeeIds.map((empId) => (
                  <div key={empId} className="flex items-center justify-between gap-2 text-sm border border-gray-200 rounded px-2 py-1">
                    <span className="text-gray-800 truncate">
                      {getAssignedEmployeeName(empId) || empId}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => {
                          unassignEmployee(empId)
                        }}
                        className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 border border-gray-200 rounded px-2 py-1.5">
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
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Assigned ({el.assignedEmployeeIds.length} / {el.capacity})
            </label>
            {el.assignedEmployeeIds.length > 0 ? (
              <div className="flex flex-col gap-1">
                {el.assignedEmployeeIds.map((empId) => (
                  <div key={empId} className="flex items-center justify-between gap-2 text-sm border border-gray-200 rounded px-2 py-1">
                    <span className="text-gray-800 truncate">
                      {getAssignedEmployeeName(empId) || empId}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => {
                          unassignEmployee(empId)
                        }}
                        className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 border border-gray-200 rounded px-2 py-1.5">
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
            <label className="text-xs font-medium text-gray-500 mb-1 block">Room Name</label>
            <input
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
              value={el.roomName}
              disabled={inputDisabled}
              onChange={(e) => update({ roomName: e.target.value } as Partial<ConferenceRoomElement>)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Capacity</label>
            <input
              type="number"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
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
          <label className="text-xs font-medium text-gray-500 mb-1 block">Area Name</label>
          <input
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
            value={el.areaName}
            disabled={inputDisabled}
            onChange={(e) => update({ areaName: e.target.value } as Partial<CommonAreaElement>)}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={el.locked}
          disabled={inputDisabled}
          onChange={(e) => update({ locked: e.target.checked })}
          className="rounded"
        />
        Locked
      </label>

      {canEdit && selectedIds.length >= 1 && (
        <button
          type="button"
          onClick={() => {
            deleteElements(selectedIds)
            useUIStore.getState().clearSelection()
          }}
          className="mt-2 w-full px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
        >
          {selectedIds.length === 1 ? 'Delete element' : `Delete ${selectedIds.length} elements`}
        </button>
      )}
    </div>
  )
}
