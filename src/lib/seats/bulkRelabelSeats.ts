import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import type { CanvasElement } from '../../types/elements'

/**
 * Apply a numeric-suffixed label to every selected employee's
 * currently-assigned seat element. The label format is
 * `${prefix} ${i}` (1-indexed), trimmed; an empty prefix clears the
 * label so the seat falls back to its `deskId` in the roster +
 * picker (Track B's resolution order).
 *
 * Examples:
 *   prefix="N1"     → "N1 1", "N1 2", "N1 3"
 *   prefix="Window" → "Window 1", "Window 2"
 *   prefix=""       → labels cleared (revert to deskId)
 *
 * Cross-floor safe: walks the active floor's elements via
 * `useElementsStore.updateElement`; for assignments on other floors
 * we read from `floorStore.getFloorElements` and write back via
 * `setFloorElements`, mirroring the pattern `seatAssignment.ts`
 * already established.
 *
 * Order is the iteration order of `employeeIds` — callers control
 * how that's sorted (typically the user's table sort). Employees
 * without a seat are silently skipped (counted in the return) so a
 * mixed selection doesn't error.
 */
export function bulkRelabelSeats(
  employeeIds: string[],
  prefix: string,
): { relabeled: number; skipped: number } {
  const employeeStore = useEmployeeStore.getState()
  const floorStore = useFloorStore.getState()
  const elementsStore = useElementsStore.getState()
  const activeFloorId = floorStore.activeFloorId
  const trimmedPrefix = prefix.trim()

  let relabeled = 0
  let skipped = 0
  let counter = 1

  // Cache off-active-floor element maps so we make at most one
  // setFloorElements call per floor (each call replaces the floor's
  // entire element map; a per-employee write would be O(N²) in the
  // worst case — every selected seat triggering a fresh map clone).
  const dirtyFloors = new Map<string, Record<string, CanvasElement>>()

  for (const empId of employeeIds) {
    const emp = employeeStore.employees[empId]
    if (!emp || !emp.seatId || !emp.floorId) {
      skipped++
      continue
    }
    const newLabel = trimmedPrefix ? `${trimmedPrefix} ${counter}` : ''
    counter++

    if (emp.floorId === activeFloorId) {
      // The active floor goes through the elements store so the
      // canvas + properties panel re-render in lockstep.
      elementsStore.updateElement(emp.seatId, { label: newLabel })
      relabeled++
    } else {
      // Off-active floors: stage updates in a per-floor map, flush
      // each floor once at the end.
      let floorEls = dirtyFloors.get(emp.floorId)
      if (!floorEls) {
        floorEls = { ...floorStore.getFloorElements(emp.floorId) }
        dirtyFloors.set(emp.floorId, floorEls)
      }
      const el = floorEls[emp.seatId]
      if (!el) {
        skipped++
        continue
      }
      floorEls[emp.seatId] = { ...el, label: newLabel }
      relabeled++
    }
  }

  for (const [floorId, els] of dirtyFloors) {
    floorStore.setFloorElements(floorId, els)
  }

  return { relabeled, skipped }
}
