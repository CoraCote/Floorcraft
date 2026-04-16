import { useEffect } from 'react'
import { useElementsStore } from '../stores/elementsStore'
import { useCanvasStore } from '../stores/canvasStore'
import { useUIStore } from '../stores/uiStore'
import { useShallow } from 'zustand/react/shallow'
import { cleanupElementAssignments } from '../lib/seatAssignment'
import { isWallElement } from '../types/elements'

export function useKeyboardShortcuts() {
  const { selectedIds, clearSelection, setPresentationMode, presentationMode, setShortcutsOverlayOpen } = useUIStore(useShallow((s) => ({ selectedIds: s.selectedIds, clearSelection: s.clearSelection, setPresentationMode: s.setPresentationMode, presentationMode: s.presentationMode, setShortcutsOverlayOpen: s.setShortcutsOverlayOpen })))
  const { removeElements, duplicateElements, moveElements, groupElements, ungroupElements } = useElementsStore(useShallow((s) => ({ removeElements: s.removeElements, duplicateElements: s.duplicateElements, moveElements: s.moveElements, groupElements: s.groupElements, ungroupElements: s.ungroupElements })))
  const elements = useElementsStore((s) => s.elements)
  const { setActiveTool, toggleGrid, zoomIn, zoomOut, resetZoom } = useCanvasStore(useShallow((s) => ({ setActiveTool: s.setActiveTool, toggleGrid: s.toggleGrid, zoomIn: s.zoomIn, zoomOut: s.zoomOut, resetZoom: s.resetZoom })))
  const undo = useElementsStore.temporal.getState().undo
  const redo = useElementsStore.temporal.getState().redo

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const mod = e.metaKey || e.ctrlKey

      if (e.key === 'Escape') {
        if (presentationMode) {
          setPresentationMode(false)
        } else {
          clearSelection()
          setActiveTool('select')
        }
        return
      }

      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return }
      if (mod && e.key === 'Z') { e.preventDefault(); redo(); return }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        for (const id of selectedIds) cleanupElementAssignments(id, { skipElementWrite: true })
        removeElements(selectedIds)
        clearSelection()
        return
      }

      if (mod && e.key === 'd') {
        e.preventDefault()
        if (selectedIds.length > 0) {
          const newIds = duplicateElements(selectedIds)
          useUIStore.getState().setSelectedIds(newIds)
        }
        return
      }

      if (mod && e.key === 'a') {
        e.preventDefault()
        useUIStore.getState().setSelectedIds(Object.keys(elements))
        return
      }

      if (mod && e.key === 'g' && !e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length > 1) groupElements(selectedIds)
        return
      }

      if (mod && e.key === 'g' && e.shiftKey) {
        e.preventDefault()
        if (selectedIds.length === 1) {
          const el = elements[selectedIds[0]]
          if (el?.groupId) ungroupElements(el.groupId)
        }
        return
      }

      if (mod && e.key === 'l') {
        e.preventDefault()
        for (const id of selectedIds) {
          const el = elements[id]
          if (el) useElementsStore.getState().updateElement(id, { locked: !el.locked })
        }
        return
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (selectedIds.length === 0) return
        e.preventDefault()
        const amount = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -amount : e.key === 'ArrowRight' ? amount : 0
        const dy = e.key === 'ArrowUp' ? -amount : e.key === 'ArrowDown' ? amount : 0

        // Walls are rendered at (0, 0) with geometry baked into `points`, so
        // nudging x/y has no visible effect. Shift each point instead.
        const nonWallIds: string[] = []
        const updateElement = useElementsStore.getState().updateElement
        for (const id of selectedIds) {
          const el = elements[id]
          if (!el || el.locked) continue
          if (isWallElement(el)) {
            const shifted: number[] = new Array(el.points.length)
            for (let i = 0; i < el.points.length; i += 2) {
              shifted[i] = el.points[i] + dx
              shifted[i + 1] = el.points[i + 1] + dy
            }
            updateElement(id, { points: shifted, x: 0, y: 0 })
          } else {
            nonWallIds.push(id)
          }
        }
        if (nonWallIds.length > 0) moveElements(nonWallIds, dx, dy)
        return
      }

      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return }
      if (mod && e.key === '-') { e.preventDefault(); zoomOut(); return }
      if (mod && e.key === '0') { e.preventDefault(); resetZoom(); return }

      if (!mod) {
        if (e.key === 'v' || e.key === 'V') { setActiveTool('select'); return }
        if (e.key === 'w' || e.key === 'W') { setActiveTool('wall'); return }
        if (e.key === 'g' || e.key === 'G') { toggleGrid(); return }
        if (e.key === 'p' || e.key === 'P') { setPresentationMode(!presentationMode); return }
        if (e.key === '?') { setShortcutsOverlayOpen(true); return }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    selectedIds, elements, presentationMode,
    clearSelection, removeElements, duplicateElements, moveElements,
    groupElements, ungroupElements, setActiveTool, toggleGrid,
    zoomIn, zoomOut, resetZoom, setPresentationMode, setShortcutsOverlayOpen,
    undo, redo,
  ])
}
