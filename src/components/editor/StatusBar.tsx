import { useElementsStore } from '../../stores/elementsStore'
import { useUIStore } from '../../stores/uiStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useCursorStore } from '../../stores/cursorStore'
import { useMemo } from 'react'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'
import { formatLength, toRealLength, LENGTH_UNIT_SUFFIX } from '../../lib/units'

/**
 * Thin status bar pinned to the bottom of the canvas. Surfaces:
 *  - occupancy stats for the current floor (desks / assigned / open / %)
 *  - selection count (only when something is selected)
 *  - active tool + contextual hint (so the user knows what the next click will do)
 *  - total elements on the current floor
 *  - current zoom (mirrors the TopBar but handy down here for quick glances)
 */
export function StatusBar() {
  const elements = useElementsStore((s) => s.elements)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const activeTool = useCanvasStore((s) => s.activeTool)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const scale = useCanvasStore((s) => s.settings.scale)
  const scaleUnit = useCanvasStore((s) => s.settings.scaleUnit)
  const cursorX = useCursorStore((s) => s.x)
  const cursorY = useCursorStore((s) => s.y)

  const { totalDesks, assignedDesks, openDesks, occupancyPct, elementCount } = useMemo(() => {
    let totalDesks = 0
    let assignedDesks = 0
    const elementCount = Object.keys(elements).length

    for (const el of Object.values(elements)) {
      if (isDeskElement(el)) {
        totalDesks += 1
        if (el.assignedEmployeeId !== null) {
          assignedDesks += 1
        }
      } else if (isWorkstationElement(el)) {
        totalDesks += el.positions
        assignedDesks += el.assignedEmployeeIds.length
      } else if (isPrivateOfficeElement(el)) {
        totalDesks += el.capacity
        assignedDesks += el.assignedEmployeeIds.length
      }
    }

    const openDesks = totalDesks - assignedDesks
    const occupancyPct = totalDesks > 0 ? Math.round((assignedDesks / totalDesks) * 100) : 0

    return { totalDesks, assignedDesks, openDesks, occupancyPct, elementCount }
  }, [elements])

  const hint = toolHint(activeTool)

  return (
    <div className="absolute bottom-0 left-0 right-0 h-8 bg-white/90 backdrop-blur border-t border-gray-200 flex items-center px-4 gap-6 text-xs text-gray-600 overflow-x-auto whitespace-nowrap">
      <span>Desks: <strong>{totalDesks}</strong></span>
      <span>Assigned: <strong>{assignedDesks}</strong></span>
      <span>Open: <strong>{openDesks}</strong></span>
      <span>Occupancy: <strong>{occupancyPct}%</strong></span>

      <span className="w-px h-4 bg-gray-200" />

      <span>Elements: <strong>{elementCount}</strong></span>
      {selectedIds.length > 0 && (
        <span className="text-blue-700">Selected: <strong>{selectedIds.length}</strong></span>
      )}
      <span>Zoom: <strong>{Math.round(stageScale * 100)}%</strong></span>

      {/*
        Cursor coordinates in world-space units. Only render when the
        pointer is actually over the canvas — when it's off the stage
        the readout would otherwise freeze at the last-seen value and
        lie to the user. Using a fixed-width font for the numbers keeps
        adjacent status-bar items from shuffling as the digits change.
      */}
      {cursorX !== null && cursorY !== null && (
        <span
          className="tabular-nums"
          title={
            scaleUnit === 'px'
              ? 'Cursor position in canvas units (pixels). Calibrate a real-world scale from Project Settings.'
              : `Cursor position in ${LENGTH_UNIT_SUFFIX[scaleUnit]}. Scale: 1 canvas px = ${scale} ${LENGTH_UNIT_SUFFIX[scaleUnit]}.`
          }
        >
          X: <strong>{formatLength(toRealLength(cursorX, scale, scaleUnit), scaleUnit)}</strong>
          {' · '}
          Y: <strong>{formatLength(toRealLength(cursorY, scale, scaleUnit), scaleUnit)}</strong>{' '}
          <span className="text-gray-400">{LENGTH_UNIT_SUFFIX[scaleUnit]}</span>
        </span>
      )}

      {hint && (
        <>
          <span className="w-px h-4 bg-gray-200" />
          <span className="text-gray-500 italic">{hint}</span>
        </>
      )}
    </div>
  )
}

function toolHint(tool: string): string | null {
  switch (tool) {
    case 'wall':
      return 'Click to add vertices, drag to curve, double-click to finish — Esc to cancel'
    case 'door':
      return 'Hover a wall to preview — click to place a door — Esc to cancel'
    case 'window':
      return 'Hover a wall to preview — click to place a window — Esc to cancel'
    case 'pan':
      return 'Drag to pan the canvas'
    case 'measure':
      return 'Click to add ruler points, double-click to finish — Esc to clear'
    default:
      return null
  }
}
