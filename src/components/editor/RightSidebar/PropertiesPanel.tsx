import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { unassignEmployee, deleteElements } from '../../../lib/seatAssignment'
import { alignElements, distributeElements } from '../../../lib/alignment'
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
import type { TableElement, DeskElement, WorkstationElement, PrivateOfficeElement, ConferenceRoomElement, CommonAreaElement, WallElement } from '../../../types/elements'

export function PropertiesPanel() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  const employees = useEmployeeStore((s) => s.employees)

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
        className="p-1.5 rounded hover:bg-gray-100 text-gray-600 border border-gray-200"
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
              disabled={selectedIds.length < 3}
              className="p-1.5 rounded text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <AlignHorizontalSpaceAround size={16} />
            </button>
            <button
              type="button"
              aria-label="Distribute vertically"
              title="Distribute vertically"
              onClick={() => distributeElements(selectedIds, 'vertical')}
              disabled={selectedIds.length < 3}
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
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                value={firstWall.thickness}
                onChange={(e) => {
                  const t = Number(e.target.value)
                  for (const id of selectedIds) updateElement(id, { thickness: t } as Partial<WallElement>)
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Line style</label>
              <select
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                value={firstWall.dashStyle ?? 'solid'}
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
                className="w-full h-8 border border-gray-200 rounded cursor-pointer"
                value={firstWall.style.stroke}
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
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          value={el.label}
          onChange={(e) => update({ label: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">X</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={Math.round(el.x)}
            onChange={(e) => update({ x: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Y</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={Math.round(el.y)}
            onChange={(e) => update({ y: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Width</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={Math.round(el.width)}
            onChange={(e) => update({ width: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Height</label>
          <input
            type="number"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={Math.round(el.height)}
            onChange={(e) => update({ height: Number(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Rotation</label>
        <input
          type="number"
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          value={Math.round(el.rotation)}
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
            className="w-full h-8 border border-gray-200 rounded cursor-pointer"
            value={el.style.stroke}
            onChange={(e) => update({ style: { ...el.style, stroke: e.target.value } })}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Fill</label>
            <input
              type="color"
              className="w-full h-8 border border-gray-200 rounded cursor-pointer"
              value={el.style.fill}
              onChange={(e) => update({ style: { ...el.style, fill: e.target.value } })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Stroke</label>
            <input
              type="color"
              className="w-full h-8 border border-gray-200 rounded cursor-pointer"
              value={el.style.stroke}
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
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              value={el.thickness}
              onChange={(e) => update({ thickness: Number(e.target.value) } as Partial<WallElement>)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Line style</label>
            <select
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              value={el.dashStyle ?? 'solid'}
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
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={el.seatCount}
            min={1}
            max={30}
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
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Desk ID</label>
            <input
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              value={el.deskId}
              onChange={(e) => update({ deskId: e.target.value } as Partial<DeskElement>)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Assigned To</label>
            {el.assignedEmployeeId ? (
              <div className="flex items-center justify-between gap-2 text-sm border border-gray-200 rounded px-2 py-1.5">
                <span className="text-gray-800 truncate">
                  {getAssignedEmployeeName(el.assignedEmployeeId) || el.assignedEmployeeId}
                </span>
                <button
                  onClick={() => {
                    unassignEmployee(el.assignedEmployeeId!)
                  }}
                  className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                >
                  Clear
                </button>
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
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Desk ID</label>
            <input
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              value={el.deskId}
              onChange={(e) => update({ deskId: e.target.value } as Partial<WorkstationElement>)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Positions</label>
            <input
              type="number"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              value={el.positions}
              min={1}
              max={20}
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
                    <button
                      onClick={() => {
                        unassignEmployee(empId)
                      }}
                      className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                    >
                      Clear
                    </button>
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
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Desk ID</label>
            <input
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              value={el.deskId}
              onChange={(e) => update({ deskId: e.target.value } as Partial<PrivateOfficeElement>)}
            />
          </div>
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
                    <button
                      onClick={() => {
                        unassignEmployee(empId)
                      }}
                      className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                    >
                      Clear
                    </button>
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
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              value={el.roomName}
              onChange={(e) => update({ roomName: e.target.value } as Partial<ConferenceRoomElement>)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Capacity</label>
            <input
              type="number"
              className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              value={el.capacity}
              min={1}
              max={100}
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
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            value={el.areaName}
            onChange={(e) => update({ areaName: e.target.value } as Partial<CommonAreaElement>)}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={el.locked}
          onChange={(e) => update({ locked: e.target.checked })}
          className="rounded"
        />
        Locked
      </label>

      {selectedIds.length >= 1 && (
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
