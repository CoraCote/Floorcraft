import { useElementsStore } from '../../stores/elementsStore'
import { useUIStore } from '../../stores/uiStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useCursorStore } from '../../stores/cursorStore'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { formatLength, toRealLength, LENGTH_UNIT_SUFFIX } from '../../lib/units'
import { computeRosterStats } from '../../lib/rosterStats'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'
import { deriveSeatStatus } from '../../lib/seatStatus'

/**
 * Thin status bar pinned to the bottom of the canvas. Surfaces:
 *  - occupancy stats for the current floor (desks / assigned / open / %)
 *  - selection count (only when something is selected)
 *  - active tool + contextual hint (so the user knows what the next click will do)
 *  - total elements on the current floor
 *  - current zoom (mirrors the TopBar but handy down here for quick glances)
 *
 * Visual style is "JSON Crack footer": tabular-numerics, dim uppercase
 * labels with bolder values, dot separators between items, thin vertical
 * bars between groups. The goal is glanceable density without the
 * "Label: <strong>value</strong>" debug-overlay feel.
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
        // Sparse positional array — count only non-null entries.
        // `.length` is now the capacity, not the occupancy count.
        assignedDesks += el.assignedEmployeeIds.filter((id) => id !== null).length
      } else if (isPrivateOfficeElement(el)) {
        totalDesks += el.capacity
        assignedDesks += el.assignedEmployeeIds.length
      }
    }

    const openDesks = totalDesks - assignedDesks
    // Delegate the occupancy ratio to the shared helper so this surface
    // and the roster summary chip can't drift on what counts as "occupied".
    const { occupancyPct } = computeRosterStats([], elements)

    return { totalDesks, assignedDesks, openDesks, occupancyPct, elementCount }
  }, [elements])

  const hint = toolHint(activeTool)

  return (
    <div
      role="status"
      aria-label="Canvas status"
      className="absolute bottom-0 left-0 right-0 h-8 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-800 flex items-center px-4 text-[11px] text-gray-500 dark:text-gray-400 overflow-x-auto whitespace-nowrap"
    >
      <Group>
        <StatItem label="Desks" value={totalDesks} />
        <Dot />
        <StatItem label="Assigned" value={assignedDesks} />
        <Dot />
        <StatItem
          label="Open"
          value={openDesks}
          accent={totalDesks > 0 && openDesks === 0 ? 'amber' : undefined}
        />
        <Dot />
        <StatItem
          label="Occupancy"
          value={`${occupancyPct}%`}
          accent={occupancyColorFor(occupancyPct)}
        />
      </Group>

      <span className="mx-3"><Bar /></span>

      <Group>
        <StatItem label="Elements" value={elementCount} />
        {selectedIds.length > 0 && (
          <>
            <Dot />
            <StatItem label="Selected" value={selectedIds.length} accent="blue" />
          </>
        )}
        <Dot />
        <StatItem label="Zoom" value={`${Math.round(stageScale * 100)}%`} />
      </Group>

      {/*
        Cursor coordinates in world-space units. Only render when the
        pointer is actually over the canvas — when it's off the stage
        the readout would otherwise freeze at the last-seen value and
        lie to the user. Tabular-nums on the inner StatItem keeps adjacent
        items from shuffling as digits change.
      */}
      {cursorX !== null && cursorY !== null && (
        <>
          <span className="mx-3"><Bar /></span>
          <span
            className="inline-flex items-baseline gap-2"
            title={
              scaleUnit === 'px'
                ? 'Cursor position in canvas units (pixels). Calibrate a real-world scale from Project Settings.'
                : `Cursor position in ${LENGTH_UNIT_SUFFIX[scaleUnit]}. Scale: 1 canvas px = ${scale} ${LENGTH_UNIT_SUFFIX[scaleUnit]}.`
            }
          >
            <StatItem
              label="X"
              value={formatLength(toRealLength(cursorX, scale, scaleUnit), scaleUnit)}
            />
            <Dot />
            <StatItem
              label="Y"
              value={formatLength(toRealLength(cursorY, scale, scaleUnit), scaleUnit)}
            />
            <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {LENGTH_UNIT_SUFFIX[scaleUnit]}
            </span>
          </span>
        </>
      )}

      <span className="mx-3"><Bar /></span>

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
        aria-pressed={activeTool === 'calibrate-scale'}
        title="Set canvas scale by clicking two points of a known distance"
        className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded transition-colors ${
          activeTool === 'calibrate-scale'
            ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        Set scale
      </button>

      {hint && (
        <>
          <span className="mx-3"><Bar /></span>
          <span className="text-[10px] italic text-gray-500 dark:text-gray-400 truncate">
            {hint}
          </span>
        </>
      )}
    </div>
  )
}

/**
 * One label/value chip. Labels render in a small dim uppercase tracked
 * caps (the "JSON Crack" idiom), values in tabular-nums so digit-width
 * shuffle doesn't reflow the row. The optional `accent` recolours the
 * value — used to flag `Selected` (blue), occupancy health (green/amber/
 * red), and other "needs eyes here" stats.
 */
function StatItem({
  label,
  value,
  accent,
}: {
  label: string
  value: ReactNode
  accent?: 'blue' | 'green' | 'amber' | 'red'
}) {
  const valueClass =
    accent === 'blue'
      ? 'text-blue-600 dark:text-blue-300'
      : accent === 'green'
        ? 'text-green-600 dark:text-green-300'
        : accent === 'amber'
          ? 'text-amber-600 dark:text-amber-300'
          : accent === 'red'
            ? 'text-red-600 dark:text-red-300'
            : 'text-gray-700 dark:text-gray-200'
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <span className={`tabular-nums font-medium ${valueClass}`}>{value}</span>
    </span>
  )
}

function Dot() {
  return (
    <span aria-hidden className="text-gray-300 dark:text-gray-700">
      ·
    </span>
  )
}

function Bar() {
  return <span aria-hidden className="w-px h-3.5 bg-gray-200 dark:bg-gray-800" />
}

function Group({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-baseline gap-2">{children}</span>
}

/**
 * Map a 0–100 occupancy percentage to a semantic accent for the
 * Occupancy stat value. Thresholds mirror floor-planner intuition:
 *   - <50  : pale (low utilisation, no special signal)
 *   - 50–79: green ("healthy")
 *   - 80–94: amber ("tight")
 *   - 95+  : red   ("overpacked / can't add more")
 */
function occupancyColorFor(pct: number): 'green' | 'amber' | 'red' | undefined {
  if (pct >= 95) return 'red'
  if (pct >= 80) return 'amber'
  if (pct >= 50) return 'green'
  return undefined
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
