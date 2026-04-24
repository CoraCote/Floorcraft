import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFloorStore } from '../../../stores/floorStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useSeatHistoryStore } from '../../../stores/seatHistoryStore'
import {
  computeUtilizationMetricsByFloor,
  occupancyHealth,
} from '../../../lib/utilizationMetrics'
import { floorSparklineSeries } from '../../../lib/floorSparklineSeries'
import { switchToFloor } from '../../../lib/seatAssignment'
import type { CanvasElement } from '../../../types/elements'
import { FloorCompareSparkline } from './FloorCompareSparkline'

/**
 * Row-per-floor comparison table. Answers the "which floor is overcrowded?"
 * question without having to click into each floor one at a time.
 *
 * Wiring notes:
 *   - `floors` reads from `floorStore`; the *active* floor's elements live
 *     in `elementsStore` while the user is editing, so we hand both to the
 *     pure reducer and let it merge. This matches what `UtilizationWidgets`
 *     does on the Insights Panel.
 *   - `employees` comes from `employeeStore` directly (no redaction needed
 *     for floor-level seat counts — headcount totals aren't PII).
 *   - Seat-history drives the sparkline. We snapshot `entries` once and
 *     run the pure helper per floor.
 *   - Row click uses `switchToFloor` (which safely flushes the outgoing
 *     floor's live edits) and then navigates to the map view.
 */

// Shared "today" baseline for all sparklines in a single render. Taking it
// once avoids micro-skew between rows when the renderer crosses a midnight
// boundary mid-render (practically impossible, but principle-of-least-
// surprise matters here).
function useToday(): Date {
  return useMemo(() => new Date(), [])
}

export function FloorCompareTable() {
  const floors = useFloorStore((s) => s.floors)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const liveElements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)
  const historyEntries = useSeatHistoryStore((s) => s.entries)

  const navigate = useNavigate()
  const { teamSlug, officeSlug } = useParams()
  const today = useToday()

  // Floors in display order — sort by `order` so renaming doesn't reshuffle.
  const orderedFloors = useMemo(
    () => [...floors].sort((a, b) => a.order - b.order),
    [floors],
  )

  // Bridge the live-override convention that `computeUtilizationMetricsByFloor`
  // expects: the active floor's live elements, keyed by element id.
  const liveOverride = useMemo<Record<string, CanvasElement>>(() => {
    // The reducer uses `floorIdByElementId.get(id) === floor.id` to accept
    // overrides, which means a live override only takes effect for ids that
    // already appear in `floor.elements`. For newly-added elements that exist
    // only in the live store, we stitch them into the active floor's map
    // directly so the row for that floor reflects them.
    return liveElements
  }, [liveElements])

  const metricsByFloor = useMemo(() => {
    // Shadow-copy `floors` so the active floor's `elements` include any
    // newly-added ids from `liveElements` before the reducer runs. This
    // keeps the pure helper honest (elements with no floor mapping get
    // excluded) while still surfacing unsaved edits to the viewer.
    const augmented = orderedFloors.map((f) =>
      f.id === activeFloorId
        ? { ...f, elements: { ...f.elements, ...liveElements } }
        : f,
    )
    return computeUtilizationMetricsByFloor(augmented, liveOverride, employees)
  }, [orderedFloors, activeFloorId, liveElements, liveOverride, employees])

  const sparklinesByFloor = useMemo(() => {
    const out: Record<string, ReturnType<typeof floorSparklineSeries>> = {}
    for (const floor of orderedFloors) {
      const ids =
        floor.id === activeFloorId
          ? new Set([...Object.keys(floor.elements), ...Object.keys(liveElements)])
          : new Set(Object.keys(floor.elements))
      out[floor.id] = floorSparklineSeries(historyEntries, ids, today)
    }
    return out
  }, [orderedFloors, activeFloorId, liveElements, historyEntries, today])

  const handleRowClick = (floorId: string) => {
    switchToFloor(floorId)
    if (teamSlug && officeSlug) {
      navigate(`/t/${teamSlug}/o/${officeSlug}/map`)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="floor-compare-table">
        <thead>
          <tr className="text-left border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300">
            <th className="py-2 pr-3">Floor</th>
            <th className="pr-3 tabular-nums">Total seats</th>
            <th className="pr-3 tabular-nums">Assigned</th>
            <th className="pr-3 tabular-nums">Occupancy</th>
            <th className="pr-3 tabular-nums">Meeting seats</th>
            <th className="pr-3 tabular-nums">Phone booths</th>
            <th className="pr-3">Trend (14d)</th>
          </tr>
        </thead>
        <tbody>
          {orderedFloors.map((floor) => {
            const m = metricsByFloor[floor.id]
            const series = sparklinesByFloor[floor.id] ?? []
            const health = occupancyHealth(m.occupancyRatio, m.totalSeats)
            return (
              <tr
                key={floor.id}
                data-floor-id={floor.id}
                data-testid={`floor-row-${floor.id}`}
                onClick={() => handleRowClick(floor.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleRowClick(floor.id)
                  }
                }}
                className="border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 focus:outline-none focus:bg-gray-50"
              >
                <td className="py-2 pr-3 font-medium text-gray-800 dark:text-gray-100">{floor.name}</td>
                <td className="pr-3 tabular-nums">{m.totalSeats}</td>
                <td className="pr-3 tabular-nums">{m.assignedSeats}</td>
                <td className={`pr-3 tabular-nums ${HEALTH_TEXT[health]}`}>
                  {m.totalSeats > 0
                    ? `${Math.round(m.occupancyRatio * 100)}%`
                    : '—'}
                </td>
                <td className="pr-3 tabular-nums">{m.meetingRoomSeats}</td>
                <td className="pr-3 tabular-nums">{m.phoneBooths}</td>
                <td className="pr-3 text-gray-500 dark:text-gray-400">
                  <FloorCompareSparkline
                    series={series.map((p) => ({ date: p.date, value: p.assignedSeats }))}
                    ariaLabel={`14-day trend for ${floor.name}`}
                  />
                </td>
              </tr>
            )
          })}
          {orderedFloors.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-center text-gray-500 dark:text-gray-400">
                No floors in this office yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Occupancy-cell text colour per health bucket. Reuses the same green/amber/
 * red vocabulary the `UtilizationWidgets` tile bars use so the two surfaces
 * read consistently.
 */
const HEALTH_TEXT: Record<ReturnType<typeof occupancyHealth>, string> = {
  healthy: 'text-green-700 dark:text-green-300',
  warn: 'text-amber-700 dark:text-amber-300',
  critical: 'text-red-700 dark:text-red-300',
  unknown: 'text-gray-500 dark:text-gray-400',
}
