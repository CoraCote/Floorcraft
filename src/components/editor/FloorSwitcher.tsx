import { useFloorStore } from '../../stores/floorStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useProjectStore } from '../../stores/projectStore'
import { switchToFloor, deleteFloor } from '../../lib/seatAssignment'
import { emit } from '../../lib/audit'
import { useCan } from '../../hooks/useCan'
import {
  isAssignableElement,
  isDeskElement,
  type CanvasElement,
} from '../../types/elements'
import { ConfirmDialog } from './ConfirmDialog'
import { Plus } from 'lucide-react'
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useParams } from 'react-router-dom'
import { OfficeSwitcher } from '../team/OfficeSwitcher'

/**
 * Wave 9C: drag-to-reorder mime. Distinct from `application/floocraft-element-type`
 * (ElementLibrary tile drags) and `application/employee-id` (PeoplePanel
 * drags) so the canvas drop handler doesn't accidentally try to spawn an
 * element when the user releases a floor tab over the canvas.
 */
const FLOOR_DRAG_MIME = 'application/floocraft-floor-id'

/**
 * Count employees currently seated on a floor by summing the per-element
 * assignee lists. Powers the "you'll unassign N people" warning on the
 * floor-delete confirm dialog — seeing the number makes the consequence
 * concrete in a way "This floor has elements" never did.
 */
function countSeatedEmployees(floorElements: Record<string, CanvasElement>): number {
  let count = 0
  for (const el of Object.values(floorElements)) {
    if (!isAssignableElement(el)) continue
    if (isDeskElement(el)) {
      if (el.assignedEmployeeId) count += 1
    } else {
      // Workstation `assignedEmployeeIds` is now a sparse positional
      // array (length === positions, with nulls for empty slots);
      // private offices still store a dense `string[]`. Counting truthy
      // entries handles both shapes uniformly.
      count += el.assignedEmployeeIds.filter((id) => !!id).length
    }
  }
  return count
}

export function FloorSwitcher() {
  const { floors, activeFloorId } = useFloorStore(
    useShallow((s) => ({ floors: s.floors, activeFloorId: s.activeFloorId }))
  )
  const addFloor = useFloorStore((s) => s.addFloor)
  const renameFloor = useFloorStore((s) => s.renameFloor)
  const reorderFloors = useFloorStore((s) => s.reorderFloors)
  const duplicateFloor = useFloorStore((s) => s.duplicateFloor)
  const getFloorElements = useFloorStore((s) => s.getFloorElements)

  const elements = useElementsStore((s) => s.elements)
  const canEdit = useCan('editMap')

  // Wave 15D — office identity promoted into this row. Read the
  // current project name off projectStore rather than threading it
  // through props so the switcher stays a leaf render that doesn't
  // fire on every project mutation the editor makes.
  const project = useProjectStore((s) => s.currentProject)
  const updateProjectName = useProjectStore((s) => s.updateProjectName)
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()

  // Rename-in-place for the office name. Triggered from the
  // OfficeSwitcher dropdown's "Rename this office" row — the
  // switcher handles all the menu affordances; we just own the
  // inline input state and keyboard handling.
  const [renamingOffice, setRenamingOffice] = useState(false)
  const [officeNameValue, setOfficeNameValue] = useState('')
  const officeNameInputRef = useRef<HTMLInputElement>(null)

  const [contextMenuFloorId, setContextMenuFloorId] = useState<string | null>(null)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [renamingFloorId, setRenamingFloorId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Target of the pending delete confirmation. `null` means no dialog is
  // open. We stash the seated-employee count here so the confirm copy can
  // reference it without re-computing while the dialog is visible.
  const [pendingDelete, setPendingDelete] = useState<
    | null
    | { floorId: string; floorName: string; elementCount: number; seatedCount: number }
  >(null)

  // Wave 9C drag state. `draggingFloorId` is the floor currently being
  // dragged; `dropIndex` is the gap index where it would land (0..N).
  // Both stay null when nothing is being dragged so the caret renders only
  // during an actual drag.
  const [draggingFloorId, setDraggingFloorId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const renameInputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const sortedFloors = [...floors].sort((a, b) => a.order - b.order)

  useEffect(() => {
    if (renamingFloorId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingFloorId])

  // Focus + select the office-name input the moment the user picks
  // "Rename this office" from the OfficeSwitcher, mirroring the
  // floor-rename pattern above.
  useEffect(() => {
    if (renamingOffice && officeNameInputRef.current) {
      officeNameInputRef.current.focus()
      officeNameInputRef.current.select()
    }
  }, [renamingOffice])

  const handleOfficeRenameSubmit = () => {
    const trimmed = officeNameValue.trim()
    if (trimmed && trimmed !== project?.name) {
      updateProjectName(trimmed)
    }
    setRenamingOffice(false)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuFloorId(null)
      }
    }
    if (contextMenuFloorId) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenuFloorId])

  const handleSwitchFloor = (newFloorId: string) => {
    switchToFloor(newFloorId)
  }

  const handleAddFloor = () => {
    if (!canEdit) return
    // switchToFloor already snapshots the outgoing floor's live elements
    // before loading the new one, so we just need to create the new floor
    // and hand off to the centralized switch.
    const newId = addFloor()
    const newFloor = useFloorStore.getState().floors.find((f) => f.id === newId)
    switchToFloor(newId)
    void emit('floor.create', 'floor', newId, { name: newFloor?.name ?? '' })
  }

  const handleContextMenu = (e: React.MouseEvent, floorId: string) => {
    // Viewers see the tabs but not the rename/delete context menu — no
    // point offering actions they can't take.
    if (!canEdit) return
    e.preventDefault()
    setContextMenuFloorId(floorId)
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  const handleRenameStart = (floorId: string) => {
    const floor = floors.find((f) => f.id === floorId)
    if (!floor) return
    setRenameValue(floor.name)
    setRenamingFloorId(floorId)
    setContextMenuFloorId(null)
  }

  const handleRenameSubmit = () => {
    if (renamingFloorId && renameValue.trim()) {
      renameFloor(renamingFloorId, renameValue.trim())
    }
    setRenamingFloorId(null)
  }

  const handleDuplicate = (floorId: string) => {
    setContextMenuFloorId(null)
    if (!canEdit) return
    // For the active floor the live elements live in elementsStore — pass
    // the snapshot so the clone reflects what the user sees, not whatever
    // was last persisted to floorStore.
    const sourceElements =
      floorId === activeFloorId ? elements : getFloorElements(floorId)
    const result = duplicateFloor(floorId, sourceElements)
    if (!result) return
    switchToFloor(result.newId)
    void emit('floor.duplicate', 'floor', result.newId, {
      sourceId: floorId,
      name: result.newName,
    })
  }

  const openDeleteConfirm = (floorId: string) => {
    setContextMenuFloorId(null)
    if (floors.length <= 1) return

    const floor = floors.find((f) => f.id === floorId)
    if (!floor) return

    // For the active floor, the live elements live in elementsStore; for
    // others they're in floorStore. Inspect the right source so the counts
    // reflect what the user sees right now, not a stale snapshot.
    const floorElements =
      floorId === activeFloorId ? elements : getFloorElements(floorId)
    const elementCount = Object.keys(floorElements).length
    const seatedCount = countSeatedEmployees(floorElements)

    if (elementCount === 0) {
      // Empty floor — no data to destroy, no need for the dialog.
      deleteFloor(floorId)
      void emit('floor.delete', 'floor', floorId, {})
      return
    }
    setPendingDelete({ floorId, floorName: floor.name, elementCount, seatedCount })
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const { floorId } = pendingDelete
    deleteFloor(floorId)
    void emit('floor.delete', 'floor', floorId, {})
    setPendingDelete(null)
  }

  // Arrow-key roving within the floor tab strip. We activate on arrow so
  // the canvas updates in lockstep (the same "automatic activation"
  // pattern as the right sidebar); Home/End jump to first/last floor.
  const onTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    if (renamingFloorId) return
    e.preventDefault()
    const idx = sortedFloors.findIndex((f) => f.id === activeFloorId)
    if (idx < 0) return
    let next = idx
    if (e.key === 'ArrowLeft') next = (idx - 1 + sortedFloors.length) % sortedFloors.length
    else if (e.key === 'ArrowRight') next = (idx + 1) % sortedFloors.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = sortedFloors.length - 1
    const nextId = sortedFloors[next].id
    handleSwitchFloor(nextId)
  }

  // Drag handlers. We use HTML5 DnD with a unique mime so the canvas drop
  // handler ignores these — and so the browser's default tab-as-link drag
  // ghost is replaced with our payload. `dragOver` tracks the gap index
  // (left vs right half of the hovered tab) so the caret renders in the
  // correct slot before drop. Drop reads the floorId from dataTransfer
  // (rather than relying on `draggingFloorId` state) so cross-frame drags
  // would still work if anyone ever wires this up beyond the strip.
  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, floorId: string) => {
    if (!canEdit) return
    e.dataTransfer.setData(FLOOR_DRAG_MIME, floorId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingFloorId(floorId)
  }

  const handleTabDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    targetIndex: number,
  ) => {
    // Only react to floor-tab drags. Without this guard, an employee or
    // element-library drag passing over the strip would move the caret.
    if (!e.dataTransfer.types.includes(FLOOR_DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    // Decide left- vs right-half so we can drop "before" or "after" the
    // hovered tab. Dropping over a tab's right half means insert at
    // targetIndex+1.
    const rect = e.currentTarget.getBoundingClientRect()
    const isAfter = e.clientX - rect.left > rect.width / 2
    const insertIndex = isAfter ? targetIndex + 1 : targetIndex

    // No-op when hovering over self (either side of the moving tab is
    // already where it sits in the sorted order).
    if (draggingFloorId) {
      const fromIndex = sortedFloors.findIndex((f) => f.id === draggingFloorId)
      if (fromIndex === insertIndex || fromIndex + 1 === insertIndex) {
        setDropIndex(null)
        return
      }
    }
    setDropIndex(insertIndex)
  }

  const handleTabDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const floorId = e.dataTransfer.getData(FLOOR_DRAG_MIME)
    if (!floorId) return
    e.preventDefault()
    if (dropIndex === null) {
      setDraggingFloorId(null)
      setDropIndex(null)
      return
    }
    // Adjust target index because removing the source from the array
    // shifts everything after it left by one. `reorderFloors` performs
    // this same splice internally, so we just feed it the post-removal
    // index.
    const fromIndex = sortedFloors.findIndex((f) => f.id === floorId)
    let toIndex = dropIndex
    if (fromIndex >= 0 && fromIndex < dropIndex) toIndex = dropIndex - 1

    const result = reorderFloors(floorId, toIndex)
    if (result) {
      void emit('floor.reorder', 'floor', floorId, {
        fromIndex: result.fromIndex,
        toIndex: result.toIndex,
      })
    }
    setDraggingFloorId(null)
    setDropIndex(null)
  }

  const handleDragEnd = () => {
    setDraggingFloorId(null)
    setDropIndex(null)
  }

  return (
    <div className="h-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-3">
      {/* ───── Left: office identity ─────
          Wave 15D moved the editable office name out of the TopBar
          and into this strip alongside the floor tabs. The
          OfficeSwitcher trigger doubles as the office name label;
          its dropdown owns the rename + switch + manage actions.
          When the user picks Rename, we swap the trigger for an
          inline input so the rename happens in place rather than in
          a modal — the same idiom the old TopBar button used. */}
      <div className="flex-shrink-0 min-w-0">
        {renamingOffice ? (
          <input
            ref={officeNameInputRef}
            aria-label="Rename office"
            className="text-sm font-semibold px-2 py-1 border border-blue-400 rounded outline-none bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-blue-500 max-w-[220px]"
            value={officeNameValue}
            onChange={(e) => setOfficeNameValue(e.target.value)}
            onBlur={handleOfficeRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleOfficeRenameSubmit()
              if (e.key === 'Escape') setRenamingOffice(false)
            }}
          />
        ) : (
          <OfficeSwitcher
            teamSlug={teamSlug}
            officeSlug={officeSlug}
            officeName={project?.name}
            onRenameCurrent={() => {
              setOfficeNameValue(project?.name ?? '')
              setRenamingOffice(true)
            }}
          />
        )}
      </div>

      {/* ───── Center: floor tabs ─────
          flex-1 wrapper centers the tabs in the dead space between
          the office switcher and the Add-Floor button on the right.
          The tablist itself keeps its left-to-right ordering and
          all of its existing roving/drag behaviour. */}
      <div className="flex-1 flex justify-center min-w-0 overflow-x-auto">
      <div
        role="tablist"
        aria-label="Floors"
        className="flex items-center gap-1"
        onKeyDown={onTablistKeyDown}
        aria-dropeffect={draggingFloorId ? 'move' : undefined}
      >
        {sortedFloors.map((floor, idx) => (
          <div
            key={floor.id}
            className="relative flex items-center"
            onDragOver={(e) => handleTabDragOver(e, idx)}
            onDrop={handleTabDrop}
          >
            {/* Insertion caret — renders before this tab when dropIndex
                points at the gap to its left. */}
            {dropIndex === idx && (
              <div
                data-testid="floor-drop-caret"
                aria-hidden="true"
                className="bg-blue-500 w-0.5 h-6 mr-1"
              />
            )}
            {renamingFloorId === floor.id ? (
              <input
                ref={renameInputRef}
                aria-label={`Rename floor ${floor.name}`}
                className="px-3 py-1.5 text-sm font-medium rounded-t border border-blue-400 outline-none w-28"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit()
                  if (e.key === 'Escape') setRenamingFloorId(null)
                }}
              />
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={floor.id === activeFloorId}
                tabIndex={floor.id === activeFloorId ? 0 : -1}
                draggable={canEdit}
                onDragStart={(e) => handleDragStart(e, floor.id)}
                onDragEnd={handleDragEnd}
                className={`px-3 py-1.5 text-sm font-medium rounded-t cursor-pointer transition-colors ${
                  floor.id === activeFloorId
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                } ${draggingFloorId === floor.id ? 'opacity-50' : ''}`}
                onClick={() => handleSwitchFloor(floor.id)}
                onContextMenu={(e) => handleContextMenu(e, floor.id)}
              >
                {floor.name}
              </button>
            )}
            {/* Trailing caret only on the last tab — when dropIndex points
                past every tab (insert at end). */}
            {idx === sortedFloors.length - 1 && dropIndex === sortedFloors.length && (
              <div
                data-testid="floor-drop-caret"
                aria-hidden="true"
                className="bg-blue-500 w-0.5 h-6 ml-1"
              />
            )}
          </div>
        ))}
      </div>
      </div>

      {/* ───── Right: editing actions ─────
          Add-Floor sits in a flex-shrink-0 cluster so it always
          renders at the row's right edge, balancing the left-side
          office switcher. */}
      <div className="flex-shrink-0 flex items-center gap-1">
        {canEdit && (
          <button
            type="button"
            onClick={handleAddFloor}
            aria-label="Add floor"
            className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            <Plus size={14} aria-hidden="true" />
            <span>Add Floor</span>
          </button>
        )}
      </div>

      {contextMenuFloorId && canEdit && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg py-1 z-50 min-w-[120px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => handleRenameStart(contextMenuFloorId)}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => handleDuplicate(contextMenuFloorId)}
          >
            Duplicate
          </button>
          {floors.length > 1 && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => openDeleteConfirm(contextMenuFloorId)}
            >
              Delete
            </button>
          )}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.floorName}"?`}
          body={
            <div className="space-y-2">
              <div>
                This floor has <strong>{pendingDelete.elementCount}</strong>{' '}
                element{pendingDelete.elementCount === 1 ? '' : 's'}.
                {pendingDelete.seatedCount > 0 && (
                  <>
                    {' '}<strong>{pendingDelete.seatedCount}</strong>{' '}
                    employee{pendingDelete.seatedCount === 1 ? '' : 's'}{' '}
                    seated here will be unassigned.
                  </>
                )}
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                This action cannot be undone.
              </div>
            </div>
          }
          confirmLabel="Delete floor"
          tone="danger"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
