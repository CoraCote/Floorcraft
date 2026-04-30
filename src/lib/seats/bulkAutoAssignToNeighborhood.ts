import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useNeighborhoodStore } from '../../stores/neighborhoodStore'
import { assignEmployee } from '../seatAssignment'
import {
  isAssignableElement,
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  type CanvasElement,
} from '../../types/elements'

export interface AutoAssignResult {
  placed: number
  unplaced: number
  /**
   * Names (or ids if a name lookup misses) of employees that didn't fit
   * because the neighborhood ran out of empty seats. Surfaced in the
   * toast so the user knows who they still need to seat.
   */
  unplacedNames: string[]
}

/**
 * Walk every assignable seat whose center lies inside the given
 * neighborhood's rectangle, find the empty ones, and place selected
 * employees into them in order. Stops when either the seats or the
 * employees run out.
 *
 * Strategy: first-fit by deskId. We sort the neighborhood's empty
 * seats by `deskId` so a relabeled "N1 1, N1 2, …" set fills in
 * label order — which is what an operator who just ran the bulk
 * relabel would expect. Workstations contribute one option per
 * empty slot so a 4-seat bench accepts up to 4 employees.
 *
 * Assignment goes through the existing `assignEmployee` so eviction,
 * undo/redo, audit emission, and history tracking all behave exactly
 * like the canvas-drop or picker paths.
 *
 * Caller is responsible for sorting the input `employeeIds` in
 * whatever order they want them placed (typically the user's current
 * roster sort).
 */
export function bulkAutoAssignToNeighborhood(
  employeeIds: string[],
  neighborhoodId: string,
): AutoAssignResult {
  const neighborhood =
    useNeighborhoodStore.getState().neighborhoods[neighborhoodId]
  if (!neighborhood) {
    return { placed: 0, unplaced: employeeIds.length, unplacedNames: [] }
  }

  const floors = useFloorStore.getState().floors
  const targetFloor = floors.find((f) => f.id === neighborhood.floorId)
  if (!targetFloor) {
    return { placed: 0, unplaced: employeeIds.length, unplacedNames: [] }
  }

  // Build the list of available (element, optionalSlot) targets
  // within the neighborhood's rectangle. One option per *empty slot*
  // so a 4-seat bench with 1 occupant contributes 3 options. Sorted
  // by (deskId, slotIndex) so labels like "N1 1, N1 2…" fill in the
  // expected order.
  type Target = { elementId: string; slotIndex?: number }
  const targets: Array<{ deskId: string; slotIndex: number; t: Target }> = []
  for (const el of Object.values(targetFloor.elements)) {
    if (!isAssignableElement(el)) continue
    if (el.locked || el.visible === false) continue
    if (!isInsideNeighborhood(el, neighborhood)) continue

    if (isDeskElement(el)) {
      if (!el.assignedEmployeeId) {
        targets.push({
          deskId: el.deskId || el.id,
          slotIndex: 0,
          t: { elementId: el.id },
        })
      }
    } else if (isWorkstationElement(el)) {
      el.assignedEmployeeIds.forEach((occupant, idx) => {
        if (occupant === null) {
          targets.push({
            deskId: el.deskId || el.id,
            slotIndex: idx,
            t: { elementId: el.id, slotIndex: idx },
          })
        }
      })
    } else if (isPrivateOfficeElement(el)) {
      const free = el.capacity - el.assignedEmployeeIds.length
      for (let i = 0; i < free; i++) {
        targets.push({
          deskId: el.deskId || el.id,
          slotIndex: i,
          t: { elementId: el.id },
        })
      }
    }
  }
  targets.sort((a, b) => {
    const c = a.deskId.localeCompare(b.deskId)
    return c !== 0 ? c : a.slotIndex - b.slotIndex
  })

  const employees = useEmployeeStore.getState().employees
  let placed = 0
  const unplacedNames: string[] = []
  for (let i = 0; i < employeeIds.length; i++) {
    const empId = employeeIds[i]
    const target = targets[i]
    if (!target) {
      const emp = employees[empId]
      unplacedNames.push(emp?.name ?? empId)
      continue
    }
    assignEmployee(empId, target.t.elementId, neighborhood.floorId, target.t.slotIndex)
    placed++
  }

  return {
    placed,
    unplaced: unplacedNames.length,
    unplacedNames,
  }
}

function isInsideNeighborhood(
  el: CanvasElement,
  n: { x: number; y: number; width: number; height: number },
): boolean {
  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2
  return cx >= n.x && cx <= n.x + n.width && cy >= n.y && cy <= n.y + n.height
}
