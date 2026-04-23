import { useEffect, useRef } from 'react'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useToastStore } from '../stores/toastStore'
import { assignEmployee } from '../lib/seatAssignment'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../types/elements'

/**
 * Detects when an undo/redo leaves the employee store pointing at a seat
 * the element store no longer claims.
 *
 * Why this happens: `elementsStore` is wrapped in zundo's `temporal`
 * middleware with `partialize` stripping every `assignedEmployeeId` /
 * `assignedEmployeeIds` before storing a history snapshot. The strip is
 * intentional — without it, undoing a move of a desk could revive an
 * assignment that seatAssignment.ts has since cleared on the employee
 * side, and the two stores would drift. The side effect is that after an
 * undo, all assignments collapse to null on the element side while the
 * employee side still has `seatId` set.
 *
 * This hook closes the loop: watch for the desync, toast the user, and
 * offer a one-click "Restore" action that re-binds each orphaned employee
 * through `assignEmployee()` (which puts both stores back in sync).
 *
 * We only fire when the orphan count *increases* between ticks — fluid
 * editing (delete, add, drag) naturally transits through intermediate
 * states and we don't want to spam the toast for steady-state actions.
 */
export function useUndoDataLossToast() {
  // Seed with the current orphan count on mount so pre-existing desyncs
  // (from a prior session) don't immediately trigger a toast.
  const lastOrphanCountRef = useRef<number>(-1)

  useEffect(() => {
    if (lastOrphanCountRef.current === -1) {
      lastOrphanCountRef.current = countOrphans()
    }

    const unsubscribe = useElementsStore.subscribe(() => {
      const nextCount = countOrphans()
      const prevCount = lastOrphanCountRef.current
      lastOrphanCountRef.current = nextCount

      if (nextCount > prevCount) {
        const lost = nextCount - prevCount
        useToastStore.getState().push({
          tone: 'warning',
          title: `Undo unassigned ${lost} ${lost === 1 ? 'employee' : 'employees'}`,
          body: 'Their seat claims were removed on the map. Click Restore to re-attach them.',
          action: {
            label: 'Restore',
            onClick: () => restoreOrphans(),
          },
        })
      }
    })
    return unsubscribe
  }, [])
}

function getClaimedEmployeeIds(): Set<string> {
  const elements = useElementsStore.getState().elements
  const claimed = new Set<string>()
  for (const el of Object.values(elements)) {
    if (isDeskElement(el)) {
      if (el.assignedEmployeeId) claimed.add(el.assignedEmployeeId)
    } else if (isWorkstationElement(el) || isPrivateOfficeElement(el)) {
      for (const id of el.assignedEmployeeIds) claimed.add(id)
    }
  }
  return claimed
}

function countOrphans(): number {
  const employees = useEmployeeStore.getState().employees
  const claimed = getClaimedEmployeeIds()
  let count = 0
  for (const emp of Object.values(employees)) {
    if (emp.seatId && !claimed.has(emp.id)) count += 1
  }
  return count
}

/**
 * Re-attach every employee whose `seatId` isn't mirrored on the element.
 * Uses `assignEmployee()` so both stores stay in sync — calling setState
 * on the element side directly would re-introduce the original bug.
 */
function restoreOrphans(): void {
  const employees = useEmployeeStore.getState().employees
  const elements = useElementsStore.getState().elements
  const claimed = getClaimedEmployeeIds()
  for (const emp of Object.values(employees)) {
    if (!emp.seatId || !emp.floorId || claimed.has(emp.id)) continue
    // The element may or may not be present in the active floor's elements
    // map, but the employee's own `floorId` is the authoritative location
    // because `assignEmployee` looks up the target on that floor either way.
    // We still guard on the active-floor lookup to avoid a no-op restore
    // when the element id is stale (e.g. the desk was deleted).
    if (emp.floorId === useFloorStore.getState().activeFloorId && !elements[emp.seatId]) continue
    assignEmployee(emp.id, emp.seatId, emp.floorId)
  }
}
