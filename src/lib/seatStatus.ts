import type {
  CanvasElement,
  DeskElement,
  PrivateOfficeElement,
  WorkstationElement,
} from '../types/elements'
import {
  isDeskElement,
  isPrivateOfficeElement,
  isWorkstationElement,
} from '../types/elements'
import type { SeatStatus } from '../types/seatAssignment'

type AssignableElement = DeskElement | WorkstationElement | PrivateOfficeElement

/**
 * Resolve the effective `SeatStatus` for a desk/workstation/private-office.
 *
 *  - If the element carries an explicit `seatStatus` override, return it
 *    verbatim (even `assigned`/`unassigned`, so a test can force the
 *    derivation through).
 *  - Otherwise, derive from the assignment: a desk with an
 *    `assignedEmployeeId` (or a workstation / private-office with a
 *    non-empty `assignedEmployeeIds`) is `assigned`; otherwise `unassigned`.
 *
 * Non-assignable elements return `unassigned` — callers typically type-guard
 * first but this keeps the signature total so the StatusBar can feed every
 * element through it without a second walk.
 */
export function deriveSeatStatus(element: CanvasElement): SeatStatus {
  if (!isAssignable(element)) return 'unassigned'
  if (element.seatStatus) return element.seatStatus
  if (isDeskElement(element)) {
    return element.assignedEmployeeId !== null ? 'assigned' : 'unassigned'
  }
  // Workstation or private-office. Workstation arrays are sparse
  // (`(string|null)[]` of length === positions), so we can't use
  // `.length > 0` as the assigned/unassigned signal — `.some(id => !!id)`
  // works uniformly across both shapes.
  const ids = (element as WorkstationElement | PrivateOfficeElement)
    .assignedEmployeeIds
  return ids.some((id) => !!id) ? 'assigned' : 'unassigned'
}

function isAssignable(el: CanvasElement): el is AssignableElement {
  return isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el)
}
