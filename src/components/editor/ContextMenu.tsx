import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { cleanupElementAssignments } from '../../lib/seatAssignment'
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

export function ContextMenu() {
  const contextMenu = useUIStore((s) => s.contextMenu)
  const setContextMenu = useUIStore((s) => s.setContextMenu)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const setSelectedIds = useUIStore((s) => s.setSelectedIds)
  const setEditingLabelId = useUIStore((s) => s.setEditingLabelId)
  const { removeElements, duplicateElements, bringToFront, sendToBack, bringForward, sendBackward, groupElements, ungroupElements, updateElement } = useElementsStore(useShallow((s) => ({ removeElements: s.removeElements, duplicateElements: s.duplicateElements, bringToFront: s.bringToFront, sendToBack: s.sendToBack, bringForward: s.bringForward, sendBackward: s.sendBackward, groupElements: s.groupElements, ungroupElements: s.ungroupElements, updateElement: s.updateElement })))
  const elements = useElementsStore((s) => s.elements)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [setContextMenu])

  if (!contextMenu) return null

  const el = contextMenu.elementId ? elements[contextMenu.elementId] : null
  const isMulti = selectedIds.length > 1

  const items: { label: string; shortcut?: string; onClick: () => void; separator?: boolean; disabled?: boolean }[] = []

  if (el) {
    items.push({ label: 'Edit Label', onClick: () => { setEditingLabelId(el.id) } })
    items.push({ label: '', onClick: () => {}, separator: true })
    items.push({ label: 'Duplicate', shortcut: 'Ctrl+D', onClick: () => {
      const newIds = duplicateElements(selectedIds.length ? selectedIds : [el.id])
      setSelectedIds(newIds)
    }})
    items.push({ label: 'Delete', shortcut: 'Del', onClick: () => {
      const toDelete = selectedIds.length ? selectedIds : [el.id]
      for (const id of toDelete) cleanupElementAssignments(id, { skipElementWrite: true })
      removeElements(toDelete)
      useUIStore.getState().clearSelection()
    }})
    items.push({ label: '', onClick: () => {}, separator: true })
    items.push({ label: 'Bring to Front', onClick: () => bringToFront(el.id) })
    items.push({ label: 'Bring Forward', onClick: () => bringForward(el.id) })
    items.push({ label: 'Send Backward', onClick: () => sendBackward(el.id) })
    items.push({ label: 'Send to Back', onClick: () => sendToBack(el.id) })
    items.push({ label: '', onClick: () => {}, separator: true })
    items.push({
      label: el.locked ? 'Unlock' : 'Lock',
      shortcut: 'Ctrl+L',
      onClick: () => updateElement(el.id, { locked: !el.locked }),
    })
    if (isMulti) {
      items.push({ label: 'Group', shortcut: 'Ctrl+G', onClick: () => groupElements(selectedIds) })
    }
    if (el.groupId) {
      items.push({ label: 'Ungroup', shortcut: 'Ctrl+Shift+G', onClick: () => ungroupElements(el.groupId!) })
    }
  } else {
    items.push({ label: 'Select All', shortcut: 'Ctrl+A', onClick: () => setSelectedIds(Object.keys(elements)) })
    items.push({ label: '', onClick: () => {}, separator: true })
    items.push({ label: 'Toggle Grid', shortcut: 'G', onClick: () => {
      useCanvasStore.getState().toggleGrid()
    }})
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="h-px bg-gray-100 my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.onClick(); setContextMenu(null) }}
            disabled={item.disabled}
            className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-40"
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="text-xs text-gray-400 ml-4">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
}
