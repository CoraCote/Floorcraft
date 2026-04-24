import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import {
  useSeatHistoryStore,
  withHistoryRecording,
  isOuterRecordingFrame,
} from '../stores/seatHistoryStore'
import { emit } from './audit'
import type { CanvasElement, DoorElement, WindowElement } from '../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isAssignableElement,
  isTableElement,
  isWallElement,
} from '../types/elements'
import type { SeatHistoryAction } from '../types/seatHistory'

/**
 * Log a single history entry, tagged with the current session actor. Safe
 * to call with only `employeeId` (assign), only `previousEmployeeId`
 * (unassign), or both (reassign) — the action is inferred. Gated on
 * `isOuterRecordingFrame` so nested helpers (e.g. `clearEmployeeFromElement`
 * invoked from within `assignEmployee`) don't double-log.
 */
function recordHistory(args: {
  elementId: string
  seatId?: string
  employeeId: string | null
  previousEmployeeId: string | null
}): void {
  if (!isOuterRecordingFrame()) return
  const { elementId, employeeId, previousEmployeeId } = args
  const seatId = args.seatId ?? elementId

  // Derive the action from before/after. An unassign (`employeeId === null`
  // and there was a predecessor) is distinct from a reassign (both sides
  // non-null AND different) and from a plain assign (no predecessor).
  let action: SeatHistoryAction
  if (employeeId === null && previousEmployeeId !== null) {
    action = 'unassign'
  } else if (
    employeeId !== null &&
    previousEmployeeId !== null &&
    employeeId !== previousEmployeeId
  ) {
    action = 'reassign'
  } else {
    action = 'assign'
  }

  const actorUserId = useProjectStore.getState().currentUserId
  useSeatHistoryStore.getState().recordAssignment({
    seatId,
    elementId,
    employeeId,
    previousEmployeeId,
    action,
    timestamp: new Date().toISOString(),
    actorUserId,
    note: null,
  })
}

/**
 * Assign an employee to a desk/workstation/private-office element.
 * Atomically updates BOTH stores. If the employee was previously seated,
 * clears the old seat. If the target desk already has an occupant (and is
 * single-capacity), evicts them.
 */
export function assignEmployee(employeeId: string, targetElementId: string, floorId: string): void {
  withHistoryRecording(() => doAssignEmployee(employeeId, targetElementId, floorId))
}

function doAssignEmployee(employeeId: string, targetElementId: string, floorId: string): void {
  const employeeStore = useEmployeeStore.getState()
  const elementsStore = useElementsStore.getState()
  const floorStore = useFloorStore.getState()

  const employee = employeeStore.employees[employeeId]
  if (!employee) return

  // Short-circuit if the employee is already seated at the target on the same
  // floor AND the element side agrees — avoids a clear-then-re-add cycle that
  // would publish an intermediate invalid state and pollute undo history with
  // no-op frames. If the element disagrees (drift), fall through so the full
  // assignment flow heals the inconsistency.
  if (employee.seatId === targetElementId && employee.floorId === floorId) {
    const isTargetOnActive = floorId === floorStore.activeFloorId
    const targetElements = isTargetOnActive
      ? elementsStore.elements
      : floorStore.getFloorElements(floorId)
    const target = targetElements[targetElementId]
    if (target && isAssignableElement(target)) {
      const agrees = isDeskElement(target)
        ? target.assignedEmployeeId === employeeId
        : isWorkstationElement(target) || isPrivateOfficeElement(target)
          ? target.assignedEmployeeIds.includes(employeeId)
          : false
      if (agrees) return
    }
  }

  // 1. If employee was previously assigned, clear the old desk (which may be on
  //    the active floor OR on another floor stored in floorStore)
  if (employee.seatId && employee.floorId) {
    clearEmployeeFromElement(employee.seatId, employeeId, employee.floorId)
  }

  // 2. Find the target element - it could be on the active floor (elementsStore)
  //    or on a different floor (floorStore)
  const isTargetOnActiveFloor = floorId === floorStore.activeFloorId
  const targetElements = isTargetOnActiveFloor
    ? useElementsStore.getState().elements
    : floorStore.getFloorElements(floorId)

  const target = targetElements[targetElementId]
  if (!target || !isAssignableElement(target)) return

  // Capture the previous desk occupant *before* the eviction write so the
  // history entry can tag this call as a reassignment rather than a bare
  // assign. Multi-capacity elements (workstation, private-office) don't
  // evict on add, so `previousEmployeeId` stays null for them — the
  // interesting predecessor there is the employee's OLD seat, which we
  // capture separately (below) for the employee-centric history view.
  const previousDeskOccupant =
    isDeskElement(target) &&
    target.assignedEmployeeId &&
    target.assignedEmployeeId !== employeeId
      ? target.assignedEmployeeId
      : null

  // 3. Evict previous occupant(s) if needed
  if (previousDeskOccupant) {
    const prev = employeeStore.employees[previousDeskOccupant]
    if (prev) {
      employeeStore.updateEmployee(previousDeskOccupant, { seatId: null, floorId: null })
    }
  }

  // 4. Update the element
  const updatedElement: CanvasElement = isDeskElement(target)
    ? { ...target, assignedEmployeeId: employeeId }
    : isWorkstationElement(target)
      ? { ...target, assignedEmployeeIds: Array.from(new Set([...target.assignedEmployeeIds, employeeId])) }
      : isPrivateOfficeElement(target)
        ? { ...target, assignedEmployeeIds: Array.from(new Set([...target.assignedEmployeeIds, employeeId])) }
        : target

  if (isTargetOnActiveFloor) {
    elementsStore.updateElement(targetElementId, updatedElement)
  } else {
    const currentFloorElements = floorStore.getFloorElements(floorId)
    floorStore.setFloorElements(floorId, { ...currentFloorElements, [targetElementId]: updatedElement })
  }

  // 5. Update the employee
  employeeStore.updateEmployee(employeeId, { seatId: targetElementId, floorId })

  void emit('seat.assign', 'employee', employeeId, { seatId: targetElementId })

  // 6. Append history. If the assigned employee was previously seated
  //    somewhere else, that earlier desk also gets an unassign entry so
  //    the old seat's timeline reflects the vacancy. The desk-level
  //    reassignment (previous occupant ← new occupant on the target) is
  //    the primary entry for this call.
  const oldEmployeeSeat = employee.seatId && employee.seatId !== targetElementId
    ? employee.seatId
    : null
  if (oldEmployeeSeat) {
    recordHistory({
      elementId: oldEmployeeSeat,
      employeeId: null,
      previousEmployeeId: employeeId,
    })
  }
  recordHistory({
    elementId: targetElementId,
    employeeId,
    previousEmployeeId: previousDeskOccupant,
  })
}

/**
 * Swap two employees' seats. Both must be currently seated (otherwise the
 * operation falls back to a plain `assignEmployee` of `aId → bId's seat`,
 * i.e. reassignment with eviction). Wrapped in a single history-recording
 * frame so undo treats the whole swap as one step, matching user intent
 * ("I moved Alice and Bob" is one action, not two).
 *
 * Returns the two element ids that were swapped, or `null` when no swap
 * could be performed (either employee missing, or one wasn't seated to
 * begin with — callers should handle the single-assign case separately).
 */
export function swapEmployees(aId: string, bId: string): { aSeat: string; bSeat: string } | null {
  if (aId === bId) return null
  const employees = useEmployeeStore.getState().employees
  const a = employees[aId]
  const b = employees[bId]
  if (!a || !b) return null
  const aSeat = a.seatId
  const bSeat = b.seatId
  const aFloor = a.floorId
  const bFloor = b.floorId
  if (!aSeat || !bSeat || !aFloor || !bFloor) return null
  if (aSeat === bSeat) return null

  // Record the entire swap as one history frame. Internally each
  // `doAssignEmployee` call evicts the other party, but by freezing the
  // starting snapshot we avoid the intermediate "nobody at either desk"
  // state — both assignments compose atomically from the caller's view.
  withHistoryRecording(() => {
    // Step 1: unseat A to break the tie. Without this, assigning A → bSeat
    // would evict B and immediately clear bSeat on B's employee record
    // — then we'd be unable to find B's old seat for the second call.
    doUnassignEmployee(aId)
    // Step 2: move B to A's old seat first. B is still seated at bSeat
    // here; assignEmployee will clear them from bSeat and place them at
    // aSeat.
    doAssignEmployee(bId, aSeat, aFloor)
    // Step 3: finally place A at bSeat (now empty).
    doAssignEmployee(aId, bSeat, bFloor)
  })
  return { aSeat, bSeat }
}

/**
 * Unassign an employee from whatever seat they currently occupy.
 */
export function unassignEmployee(employeeId: string): void {
  withHistoryRecording(() => doUnassignEmployee(employeeId))
}

function doUnassignEmployee(employeeId: string): void {
  const employeeStore = useEmployeeStore.getState()
  const employee = employeeStore.employees[employeeId]
  if (!employee || !employee.seatId || !employee.floorId) return

  const clearedElementId = employee.seatId
  clearEmployeeFromElement(employee.seatId, employeeId, employee.floorId)
  employeeStore.updateEmployee(employeeId, { seatId: null, floorId: null })

  void emit('seat.unassign', 'employee', employeeId, {})

  recordHistory({
    elementId: clearedElementId,
    employeeId: null,
    previousEmployeeId: employeeId,
  })
}

/**
 * Fully delete an employee, clearing them from any assigned desk first.
 * Also walks every floor's elements to clear stale `assignedGuestId`
 * references on TableElement seats, and nulls `managerId` on any direct
 * reports so the drawer's Manager dropdown doesn't show a dangling pointer.
 */
export function deleteEmployee(employeeId: string): void {
  unassignEmployee(employeeId)

  // Walk all floors and clean TableElement seat references.
  const floorStore = useFloorStore.getState()
  const elementsStore = useElementsStore.getState()
  const activeFloorId = floorStore.activeFloorId

  for (const floor of floorStore.floors) {
    const isActive = floor.id === activeFloorId
    const elements = isActive ? elementsStore.elements : floor.elements
    for (const el of Object.values(elements)) {
      if (!isTableElement(el)) continue
      const hasStale = el.seats.some((s) => s.assignedGuestId === employeeId)
      if (!hasStale) continue
      const cleaned = {
        ...el,
        seats: el.seats.map((s) =>
          s.assignedGuestId === employeeId ? { ...s, assignedGuestId: null } : s
        ),
      }
      if (isActive) {
        elementsStore.updateElement(el.id, cleaned)
      } else {
        const current = floorStore.getFloorElements(floor.id)
        floorStore.setFloorElements(floor.id, { ...current, [el.id]: cleaned })
      }
    }
  }

  // Null out managerId on anyone who reported to the deleted person —
  // otherwise the drawer's Manager dropdown would show a "Former manager —
  // cleared?" state on every report and exports would carry a dead id.
  const employeeStore = useEmployeeStore.getState()
  for (const emp of Object.values(employeeStore.employees)) {
    if (emp.managerId === employeeId) {
      employeeStore.updateEmployee(emp.id, { managerId: null })
    }
  }

  useEmployeeStore.getState().removeEmployee(employeeId)
}

/**
 * Centralized floor deletion: clears any employee `seatId`/`floorId`
 * references that point at elements on the floor being deleted, then removes
 * the floor. If the deleted floor was active, reloads the new active floor's
 * elements into elementsStore.
 */
export function deleteFloor(floorId: string): void {
  const floorStore = useFloorStore.getState()
  const elementsStore = useElementsStore.getState()
  const employeeStore = useEmployeeStore.getState()
  const wasActive = floorStore.activeFloorId === floorId

  // Read the floor's elements — live elementsStore if active, otherwise
  // the stored copy in floorStore.
  const floorElements = wasActive
    ? elementsStore.elements
    : floorStore.getFloorElements(floorId)

  // Clear any employee that is assigned to an element on this floor.
  for (const emp of Object.values(employeeStore.employees)) {
    if (emp.floorId !== floorId) continue
    if (emp.seatId && floorElements[emp.seatId]) {
      employeeStore.updateEmployee(emp.id, { seatId: null, floorId: null })
    } else if (emp.seatId === null) {
      // floorId set but seatId null — still reset the floor pointer.
      employeeStore.updateEmployee(emp.id, { floorId: null })
    }
  }

  // Remove the floor (this also picks a new activeFloorId if needed).
  floorStore.removeFloor(floorId)

  if (wasActive) {
    const newActiveId = useFloorStore.getState().activeFloorId
    elementsStore.setElements(
      useFloorStore.getState().getFloorElements(newActiveId)
    )
  }
}

/**
 * Clear all assignment state for an element — both sides. Safe to call at any
 * time (idempotent): clears the element's `assignedEmployeeId` /
 * `assignedEmployeeIds` / table-seat `assignedGuestId` first, then clears any
 * employees pointing at it. Works whether the element is on the active floor
 * (live elementsStore) or stored on another floor.
 */
export function cleanupElementAssignments(
  elementId: string,
  options?: { skipElementWrite?: boolean }
): void {
  const employeeStore = useEmployeeStore.getState()
  const elementsStore = useElementsStore.getState()
  const floorStore = useFloorStore.getState()
  const skipElementWrite = options?.skipElementWrite === true

  // 1. Locate the element: active floor first, then other floors.
  let foundFloorId: string | null = null
  let foundElement: CanvasElement | null = null

  const activeElement = elementsStore.elements[elementId]
  if (activeElement) {
    foundFloorId = floorStore.activeFloorId
    foundElement = activeElement
  } else {
    for (const floor of floorStore.floors) {
      if (floor.id === floorStore.activeFloorId) continue
      const el = floor.elements[elementId]
      if (el) {
        foundFloorId = floor.id
        foundElement = el
        break
      }
    }
  }

  // 2. Clear element-side assignments (skipped when the caller is about to
  //    delete the element anyway — avoids a wasted write and an extra frame
  //    in undo history).
  if (!skipElementWrite && foundElement && foundFloorId) {
    let cleaned: CanvasElement | null = null
    if (isDeskElement(foundElement)) {
      if (foundElement.assignedEmployeeId !== null) {
        cleaned = { ...foundElement, assignedEmployeeId: null }
      }
    } else if (isWorkstationElement(foundElement)) {
      if (foundElement.assignedEmployeeIds.length > 0) {
        cleaned = { ...foundElement, assignedEmployeeIds: [] }
      }
    } else if (isPrivateOfficeElement(foundElement)) {
      if (foundElement.assignedEmployeeIds.length > 0) {
        cleaned = { ...foundElement, assignedEmployeeIds: [] }
      }
    } else if (isTableElement(foundElement)) {
      if (foundElement.seats.some((s) => s.assignedGuestId !== null)) {
        cleaned = {
          ...foundElement,
          seats: foundElement.seats.map((s) => ({ ...s, assignedGuestId: null })),
        }
      }
    }

    if (cleaned) {
      if (foundFloorId === floorStore.activeFloorId) {
        elementsStore.updateElement(elementId, cleaned)
      } else {
        const current = floorStore.getFloorElements(foundFloorId)
        floorStore.setFloorElements(foundFloorId, { ...current, [elementId]: cleaned })
      }
    }
  }

  // 3. Clear employee-side pointers.
  const affected = Object.values(employeeStore.employees).filter((e) => e.seatId === elementId)
  for (const emp of affected) {
    employeeStore.updateEmployee(emp.id, { seatId: null, floorId: null })
  }
}

/**
 * Remove a specific employee reference from an element's assignment (without
 * touching the employee record — call sites may update the employee separately).
 */
function clearEmployeeFromElement(elementId: string, employeeId: string, floorId: string): void {
  const elementsStore = useElementsStore.getState()
  const floorStore = useFloorStore.getState()
  const isOnActiveFloor = floorId === floorStore.activeFloorId

  const elements = isOnActiveFloor ? elementsStore.elements : floorStore.getFloorElements(floorId)
  const el = elements[elementId]
  if (!el) return

  let updated: CanvasElement | null = null
  if (isDeskElement(el) && el.assignedEmployeeId === employeeId) {
    updated = { ...el, assignedEmployeeId: null }
  } else if (isWorkstationElement(el)) {
    updated = { ...el, assignedEmployeeIds: el.assignedEmployeeIds.filter((id) => id !== employeeId) }
  } else if (isPrivateOfficeElement(el)) {
    updated = { ...el, assignedEmployeeIds: el.assignedEmployeeIds.filter((id) => id !== employeeId) }
  }
  if (!updated) return

  if (isOnActiveFloor) {
    elementsStore.updateElement(elementId, updated)
  } else {
    floorStore.setFloorElements(floorId, { ...elements, [elementId]: updated })
  }
}

/**
 * Atomically delete one or more elements from the currently active floor.
 * Performs cascades and cleanup in a single store update so zundo sees it
 * as one undoable step:
 *
 *   - Walls: cascade-delete any doors/windows whose parentWallId matches.
 *   - Assignable elements (desk/workstation/private-office): unassign any
 *     employees currently seated at them.
 *   - Locked elements: silently skipped.
 */
export function deleteElements(elementIds: string[]): void {
  const elementsState = useElementsStore.getState().elements
  const employeesState = useEmployeeStore.getState().employees

  // 1. Filter out locked + unknown ids.
  const validIds = elementIds.filter((id) => {
    const el = elementsState[id]
    return !!el && !el.locked
  })
  if (validIds.length === 0) return

  // 2. Collect the final deletion set (including wall cascades).
  const toDelete = new Set<string>(validIds)
  for (const id of validIds) {
    const el = elementsState[id]
    if (!el) continue
    if (isWallElement(el)) {
      for (const [childId, child] of Object.entries(elementsState)) {
        if (
          (child.type === 'door' || child.type === 'window') &&
          (child as DoorElement | WindowElement).parentWallId === id
        ) {
          toDelete.add(childId)
        }
      }
    }
  }

  // 3. Collect employees to unassign (from assignable elements in toDelete).
  const employeesToUnassign: string[] = []
  for (const id of toDelete) {
    const el = elementsState[id]
    if (!el) continue
    if (isAssignableElement(el)) {
      for (const emp of Object.values(employeesState)) {
        if (emp.seatId === id) employeesToUnassign.push(emp.id)
      }
    }
    // Tables also carry guest assignments on their seats, but guests are a
    // separate concept from employees and already cleaned up elsewhere
    // (see deleteEmployee). We only need employee unassignment here.
  }

  // 4. Apply both mutations in ONE combined update so zundo snapshots once.
  const nextElements = { ...elementsState }
  for (const id of toDelete) delete nextElements[id]

  const nextEmployees = { ...employeesState }
  for (const empId of employeesToUnassign) {
    const cur = nextEmployees[empId]
    if (cur) {
      nextEmployees[empId] = { ...cur, seatId: null, floorId: null }
    }
  }

  // elementsStore is the temporal (zundo-tracked) store. Write elements first,
  // then employees — employees are excluded from the undo partialize so their
  // update can be applied separately without affecting the snapshot count.
  useElementsStore.setState({ elements: nextElements })
  useEmployeeStore.setState({ employees: nextEmployees })

  for (const id of toDelete) {
    void emit('element.delete', 'element', id, {})
  }
}

/**
 * Centralized floor switch: saves current elements to the outgoing floor,
 * loads the incoming floor's elements into elementsStore, sets activeFloorId.
 */
export function switchToFloor(newFloorId: string): void {
  const floorStore = useFloorStore.getState()
  const elementsStore = useElementsStore.getState()
  const currentFloorId = floorStore.activeFloorId
  if (newFloorId === currentFloorId) return

  // Save current floor's live elements
  floorStore.setFloorElements(currentFloorId, elementsStore.elements)
  // Load new floor
  floorStore.setActiveFloor(newFloorId)
  elementsStore.setElements(floorStore.getFloorElements(newFloorId))
}
