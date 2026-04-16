import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import type { CanvasElement } from '../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isAssignableElement,
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
 */
export function deleteEmployee(employeeId: string): void {
  unassignEmployee(employeeId)
  useEmployeeStore.getState().removeEmployee(employeeId)
}

/**
 * When an element is deleted, clear any employees assigned to it.
 */
export function cleanupElementAssignments(elementId: string): void {
  const employeeStore = useEmployeeStore.getState()
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
