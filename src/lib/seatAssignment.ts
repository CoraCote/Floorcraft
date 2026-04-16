import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import type { CanvasElement } from '../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isAssignableElement,
  isTableElement,
} from '../types/elements'

/**
 * Assign an employee to a desk/workstation/private-office element.
 * Atomically updates BOTH stores. If the employee was previously seated,
 * clears the old seat. If the target desk already has an occupant (and is
 * single-capacity), evicts them.
 */
export function assignEmployee(employeeId: string, targetElementId: string, floorId: string): void {
  const employeeStore = useEmployeeStore.getState()
  const elementsStore = useElementsStore.getState()
  const floorStore = useFloorStore.getState()

  const employee = employeeStore.employees[employeeId]
  if (!employee) return

  // Short-circuit if the employee is already seated at the target on the same
  // floor — avoids a clear-then-re-add cycle that would publish an intermediate
  // invalid state and pollute undo history with no-op frames.
  if (employee.seatId === targetElementId && employee.floorId === floorId) return

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

  // 3. Evict previous occupant(s) if needed
  if (isDeskElement(target) && target.assignedEmployeeId && target.assignedEmployeeId !== employeeId) {
    const previousEmpId = target.assignedEmployeeId
    const prev = employeeStore.employees[previousEmpId]
    if (prev) {
      employeeStore.updateEmployee(previousEmpId, { seatId: null, floorId: null })
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
}

/**
 * Unassign an employee from whatever seat they currently occupy.
 */
export function unassignEmployee(employeeId: string): void {
  const employeeStore = useEmployeeStore.getState()
  const employee = employeeStore.employees[employeeId]
  if (!employee || !employee.seatId || !employee.floorId) return

  clearEmployeeFromElement(employee.seatId, employeeId, employee.floorId)
  employeeStore.updateEmployee(employeeId, { seatId: null, floorId: null })
}

/**
 * Fully delete an employee, clearing them from any assigned desk first.
 * Also walks every floor's elements to clear stale `assignedGuestId`
 * references on TableElement seats.
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
export function cleanupElementAssignments(elementId: string): void {
  const employeeStore = useEmployeeStore.getState()
  const elementsStore = useElementsStore.getState()
  const floorStore = useFloorStore.getState()

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

  // 2. Clear element-side assignments.
  if (foundElement && foundFloorId) {
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
