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
import { deriveSeatStatus } from '../../lib/seatStatus'

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
  const setActiveTool = useCanvasStore((s) => s.setActiveTool)
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
      // Decommissioned seats are treated as "not counted" in occupancy math —
      // they still render, just dimmed, so the planner can see them without
      // them skewing the headline utilisation number.
      if (deriveSeatStatus(el) === 'decommissioned') continue
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
    <div className="absolute bottom-0 left-0 right-0 h-8 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-t border-gray-200 dark:border-gray-800 flex items-center px-4 gap-6 text-xs text-gray-600 dark:text-gray-300 overflow-x-auto whitespace-nowrap">
      <span>Desks: <strong>{totalDesks}</strong></span>
      <span>Assigned: <strong>{assignedDesks}</strong></span>
      <span>Open: <strong>{openDesks}</strong></span>
      <span>Occupancy: <strong>{occupancyPct}%</strong></span>

      <span className="w-px h-4 bg-gray-200 dark:bg-gray-700" />

      <span>Elements: <strong>{elementCount}</strong></span>
      {selectedIds.length > 0 && (
        <span className="text-blue-700 dark:text-blue-300">Selected: <strong>{selectedIds.length}</strong></span>
      )}
      <span>Zoom: <strong>{Math.round(stageScale * 100)}%</strong></span>

      {/*
        Calibrate-scale trigger. The status bar is the least visually
        invasive spot for this — it already surfaces scale-related
        context (cursor coords in real units) so a "Set scale" affordance
        is discoverable here without adding yet another toolbar icon.
        We toggle the tool on/off from the same button so a second click
        exits without the user hunting for a cancel.
      */}
      <button
        type="button"
        onClick={() =>
          setActiveTool(activeTool === 'calibrate-scale' ? 'select' : 'calibrate-scale')
        }
        className={`text-[11px] px-2 py-0.5 rounded border ${
          activeTool === 'calibrate-scale'
            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 text-blue-700 dark:text-blue-300'
            : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
        title="Set canvas scale by clicking two points of a known distance"
        aria-pressed={activeTool === 'calibrate-scale'}
      >
        Set scale
      </button>

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
          <span className="text-gray-400 dark:text-gray-500">{LENGTH_UNIT_SUFFIX[scaleUnit]}</span>
        </span>
      )}

      {hint && (
        <>
          <span className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
          <span className="text-gray-500 dark:text-gray-400 italic">{hint}</span>
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
    case 'calibrate-scale':
      return 'Click two points of a known distance, then enter the real length — Esc to cancel'
    default:
      return null
  }
}
