import { useMemo } from 'react'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { useAllFloorElements } from '../../../hooks/useActiveFloorElements'
import type { CanvasElement } from '../../../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isAssignableElement,
} from '../../../types/elements'
import { getElementsInNeighborhood } from '../../../lib/neighborhoodContainment'

/**
 * Per-neighborhood headcount rollup. Lives in the Insights Panel under
 * the utilization widgets — one line per neighborhood with the format
 * "Name: N seats, M assigned". Hidden when no neighborhoods exist so
 * a fresh office doesn't get a stray empty header.
 *
 * Seats here means "assignable slots": a desk is 1, a workstation is
 * its `positions`, a private office is its `capacity`. Assigned counts
 * the non-null assignment fields on each contained element.
 */
export function NeighborhoodMetrics() {
  const neighborhoodsMap = useNeighborhoodStore((s) => s.neighborhoods)
  const floorsWithElements = useAllFloorElements()
  const elements = useMemo(
    () =>
      floorsWithElements.reduce(
        (acc, f) => Object.assign(acc, f.elements),
        {} as Record<string, CanvasElement>,
      ),
    [floorsWithElements],
  )

  const rows = useMemo(() => {
    const list = Object.values(neighborhoodsMap)
    if (list.length === 0) return []
    return list.map((n) => {
      const contained = getElementsInNeighborhood(elements, n)
      let seats = 0
      let assigned = 0
      for (const el of contained) {
        if (!isAssignableElement(el)) continue
        if (isDeskElement(el)) {
          seats += 1
          if (el.assignedEmployeeId) assigned += 1
        } else if (isWorkstationElement(el)) {
          seats += el.positions
          assigned += el.assignedEmployeeIds.length
        } else if (isPrivateOfficeElement(el)) {
          seats += el.capacity
          assigned += el.assignedEmployeeIds.length
        }
      }
      return { id: n.id, name: n.name, color: n.color, seats, assigned }
    })
  }, [neighborhoodsMap, elements])

  if (rows.length === 0) return null

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        Neighborhoods
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200"
          >
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: r.color }}
            />
            <span className="truncate font-medium text-gray-800 dark:text-gray-100">{r.name}</span>
            <span className="ml-auto text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {r.seats} seats, {r.assigned} assigned
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
