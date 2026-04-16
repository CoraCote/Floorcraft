import { useFloorStore } from '../../stores/floorStore'
import { useElementsStore } from '../../stores/elementsStore'
import { Plus } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

export function FloorSwitcher() {
  const { floors, activeFloorId } = useFloorStore(
    useShallow((s) => ({ floors: s.floors, activeFloorId: s.activeFloorId }))
  )
  const setActiveFloor = useFloorStore((s) => s.setActiveFloor)
  const addFloor = useFloorStore((s) => s.addFloor)
  const removeFloor = useFloorStore((s) => s.removeFloor)
  const renameFloor = useFloorStore((s) => s.renameFloor)
  const setFloorElements = useFloorStore((s) => s.setFloorElements)
  const getFloorElements = useFloorStore((s) => s.getFloorElements)

  const elements = useElementsStore((s) => s.elements)
  const setElements = useElementsStore((s) => s.setElements)

  const [contextMenuFloorId, setContextMenuFloorId] = useState<string | null>(null)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [renamingFloorId, setRenamingFloorId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
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
    if (newFloorId === activeFloorId) return
    // Save current floor's elements
    setFloorElements(activeFloorId, elements)
    // Set new active floor
    setActiveFloor(newFloorId)
    // Load the new floor's elements
    setElements(getFloorElements(newFloorId))
  }

  const handleAddFloor = () => {
    // Save current floor's elements before switching
    setFloorElements(activeFloorId, elements)
    const newId = addFloor()
    setActiveFloor(newId)
    setElements({})
  }

  const handleContextMenu = (e: React.MouseEvent, floorId: string) => {
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

  const handleDelete = (floorId: string) => {
    setContextMenuFloorId(null)
    if (floors.length <= 1) return

    const floor = floors.find((f) => f.id === floorId)
    const floorElements = getFloorElements(floorId)
    const hasElements = Object.keys(floorElements).length > 0

    if (hasElements) {
      const confirmed = window.confirm(
        `"${floor?.name || 'This floor'}" has elements. Are you sure you want to delete it?`
      )
      if (!confirmed) return
    }

    // If deleting the active floor, save current elements first
    if (floorId === activeFloorId) {
      // removeFloor will pick a new activeFloorId
      removeFloor(floorId)
      const newActiveId = useFloorStore.getState().activeFloorId
      setElements(getFloorElements(newActiveId))
    } else {
      removeFloor(floorId)
    }
  }

  return (
    <div className="h-10 bg-white border-b border-gray-200 flex items-center px-4 gap-1">
      {sortedFloors.map((floor) => (
        <div key={floor.id} className="relative">
          {renamingFloorId === floor.id ? (
            <input
              ref={renameInputRef}
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

      <button
        onClick={handleAddFloor}
        className="flex items-center gap-1 px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors ml-1"
      >
        <Plus size={14} />
        <span>Add Floor</span>
      </button>

      {contextMenuFloorId && (
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
              onClick={() => handleDelete(contextMenuFloorId)}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
