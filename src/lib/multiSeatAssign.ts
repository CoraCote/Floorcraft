import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../types/elements'
import { assignEmployee } from './seatAssignment'

/**
 * Consume employees from `uiStore.assignmentQueue` into the element at
 * `elementId`. Returns:
 *   -1 — the element isn't assignable (caller should ignore the click).
 *    0 — this element filled cleanly (desks always return 0 on success —
 *        they're single-capacity so user is expected to keep clicking —
 *        and multi-seat elements return 0 when the queue fit).
 *   >0 — overflow count for multi-seat elements: this many employees
 *        still need seats after this workstation/office was maxed out.
 */
export function consumeQueueAtElement(elementId: string, floorId: string): number {
  const element = useElementsStore.getState().elements[elementId]
  if (!element) return -1

  let open = 0
  let isSingleCapacity = false
  if (isDeskElement(element)) {
    open = element.assignedEmployeeId ? 0 : 1
    isSingleCapacity = true
  } else if (isWorkstationElement(element)) {
    // Sparse positional array — open slots are the nulls, not
    // `positions - length` (length now equals positions).
    const filled = element.assignedEmployeeIds.filter((id) => id !== null).length
    open = Math.max(0, element.positions - filled)
  } else if (isPrivateOfficeElement(element)) {
    open = Math.max(0, element.capacity - element.assignedEmployeeIds.length)
  } else {
    return -1
  }

  const queue = useUIStore.getState().assignmentQueue
  if (queue.length === 0 || open === 0) {
    // Nothing to consume (queue empty, or target full). Report 0 so the
    // caller doesn't show a stale overflow warning.
    return 0
  }

  const consumed = Math.min(open, queue.length)
  for (let i = 0; i < consumed; i++) {
    assignEmployee(queue[i], elementId, floorId)
  }
  const remainder = queue.slice(consumed)
  useUIStore.getState().setAssignmentQueue(remainder)

  // Desks are intrinsically single-capacity: the user is expected to keep
  // clicking for the remaining queue. Don't treat the leftover as overflow.
  if (isSingleCapacity) return 0
  return remainder.length
}
