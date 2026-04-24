import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../types/elements'
import type { CanvasElement } from '../types/elements'
import type { Employee } from '../types/employee'
import {
  computeDeskEquipmentStatus,
  statusColor,
  type EquippableDesk,
} from './equipmentOverlay'

export interface OverlayRect {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  color: string
}

/**
 * Walk every seat-bearing element, resolve the primary assigned
 * employee, and emit one rect when the status is not `na`. Pure
 * function — callers can pass fixture maps directly.
 *
 * Extracted from EquipmentOverlayLayer.tsx so the component file
 * only exports components (required by react-refresh/only-export-components).
 */
export function computeRects(
  elements: Record<string, CanvasElement>,
  employees: Record<string, Employee>,
): OverlayRect[] {
  const out: OverlayRect[] = []
  for (const el of Object.values(elements)) {
    let desk: EquippableDesk | null = null
    let assignedId: string | null = null
    if (isDeskElement(el)) {
      desk = el
      assignedId = el.assignedEmployeeId
    } else if (isWorkstationElement(el)) {
      desk = el
      assignedId = el.assignedEmployeeIds[0] ?? null
    } else if (isPrivateOfficeElement(el)) {
      desk = el
      assignedId = el.assignedEmployeeIds[0] ?? null
    }
    if (!desk) continue

    const employee = assignedId ? employees[assignedId] ?? null : null
    const status = computeDeskEquipmentStatus(desk, employee)
    if (status === 'na') continue

    out.push({
      id: el.id,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      rotation: el.rotation,
      color: statusColor(status),
    })
  }
  return out
}
