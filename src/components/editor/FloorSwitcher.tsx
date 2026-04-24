import { useFloorStore } from '../../stores/floorStore'
import { useElementsStore } from '../../stores/elementsStore'
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
      count += el.assignedEmployeeIds.length
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
  const getFloorElements = useFloorStore((s) => s.getFloorElements)

  const elements = useElementsStore((s) => s.elements)
  const canEdit = useCan('editMap')

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
  const renameInputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const sortedFloors = [...floors].sort((a, b) => a.order - b.order)

  useEffect(() => {
    if (renamingFloorId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingFloorId])

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

  return (
    <div className="h-10 bg-white border-b border-gray-200 flex items-center px-4 gap-1">
      <div
        role="tablist"
        aria-label="Floors"
        className="flex items-center gap-1"
        onKeyDown={onTablistKeyDown}
      >
        {sortedFloors.map((floor) => (
          <div key={floor.id} className="relative">
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
                className={`px-3 py-1.5 text-sm font-medium rounded-t cursor-pointer transition-colors ${
                  floor.id === activeFloorId
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
                onClick={() => handleSwitchFloor(floor.id)}
                onContextMenu={(e) => handleContextMenu(e, floor.id)}
              >
                {floor.name}
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={handleAddFloor}
          aria-label="Add floor"
          className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors ml-1"
        >
          <Plus size={14} aria-hidden="true" />
          <span>Add Floor</span>
        </button>
      )}

      {contextMenuFloorId && canEdit && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[120px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => handleRenameStart(contextMenuFloorId)}
          >
            Rename
          </button>
          {floors.length > 1 && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
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
              <div className="text-gray-500">
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
