import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import { useToastStore } from '../stores/toastStore'
import { useUIStore } from '../stores/uiStore'
import type { Employee } from '../types/employee'
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
import { removeVertex } from './wallEditing'
import { locateOnStraightSegments } from './wallPath'
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
 *
 * `slotIndex` is workstation-specific: when supplied (and in range), the
 * employee is placed at exactly that slot — evicting whoever was there,
 * matching the 1:1 desk reassignment idiom. When omitted (or out of
 * range), the employee lands at the first empty slot. Ignored for desks
 * and private offices.
 */
export function assignEmployee(
  employeeId: string,
  targetElementId: string,
  floorId: string,
  slotIndex?: number,
): void {
  withHistoryRecording(() => doAssignEmployee(employeeId, targetElementId, floorId, slotIndex))
}

function doAssignEmployee(
  employeeId: string,
  targetElementId: string,
  floorId: string,
  slotIndex?: number,
): void {
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
      // For workstations with an explicit `slotIndex`, "agrees" means
      // the employee is already AT THAT SLOT — otherwise we need to
      // shuffle them, which is the whole point of slot-aware
      // assignment.
      const agrees = isDeskElement(target)
        ? target.assignedEmployeeId === employeeId
        : isWorkstationElement(target)
          ? typeof slotIndex === 'number' && slotIndex >= 0 && slotIndex < target.assignedEmployeeIds.length
            ? target.assignedEmployeeIds[slotIndex] === employeeId
            : target.assignedEmployeeIds.includes(employeeId)
          : isPrivateOfficeElement(target)
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
  // assign. For 1:1 desks the predecessor is whoever was on the desk;
  // for workstations the predecessor is whoever held the *target slot*
  // (computed below alongside the slot resolution). Private offices
  // still don't evict on add, so the predecessor there stays null —
  // the interesting predecessor is the employee's OLD seat, which we
  // capture separately (below) for the employee-centric history view.
  let previousDeskOccupant: string | null =
    isDeskElement(target) &&
    target.assignedEmployeeId &&
    target.assignedEmployeeId !== employeeId
      ? target.assignedEmployeeId
      : null

  // 3. Compute the workstation slot write (if applicable). We resolve
  //    the target slot here so its evicted occupant can flow through
  //    the same eviction + history machinery that the 1:1 desk path
  //    uses below.
  let workstationNextSlots: Array<string | null> | null = null
  let workstationEvicted: string | null = null
  if (isWorkstationElement(target)) {
    const next: Array<string | null> = [...target.assignedEmployeeIds]
    // If this employee already occupies a slot on this workstation,
    // free that slot first so they don't end up on the workstation
    // twice when the user shuffles them within the same bench.
    const existingIdx = next.findIndex((id) => id === employeeId)
    if (existingIdx !== -1) next[existingIdx] = null

    const requestedSlot =
      typeof slotIndex === 'number' &&
      Number.isFinite(slotIndex) &&
      slotIndex >= 0 &&
      slotIndex < next.length
        ? Math.floor(slotIndex)
        : -1
    const fallbackSlot = next.findIndex((id) => id === null)
    const placeAt = requestedSlot >= 0 ? requestedSlot : fallbackSlot

    if (placeAt === -1) {
      // No empty slot AND no specific slot requested — workstation is
      // full. Bail without mutating; the caller's 1:1 short-circuit
      // above already handled the "already on this workstation" case.
      // This mirrors how dropping on a full single desk is a no-op
      // when no eviction can happen; surfacing it as an audit/error
      // is left to a follow-up if call sites care.
      return
    }

    const evicted = next[placeAt]
    if (evicted && evicted !== employeeId) {
      workstationEvicted = evicted
      previousDeskOccupant = evicted
    }
    next[placeAt] = employeeId
    workstationNextSlots = next
  }

  // 4. Evict previous occupant(s) if needed. Both the 1:1 desk path
  //    and the workstation slot path funnel through the same eviction
  //    so the employee record gets nulled identically (and the seat
  //    history gets a single "reassign" entry per call).
  if (previousDeskOccupant) {
    const prev = employeeStore.employees[previousDeskOccupant]
    if (prev) {
      employeeStore.updateEmployee(previousDeskOccupant, { seatId: null, floorId: null })
    }
  }
  // Silence unused-binding lint when the workstation branch didn't
  // populate `workstationEvicted` — the value is intentionally captured
  // for symmetry / future audit hooks even if eviction is already
  // handled via `previousDeskOccupant`.
  void workstationEvicted

  // 5. Update the element
  const updatedElement: CanvasElement = isDeskElement(target)
    ? { ...target, assignedEmployeeId: employeeId }
    : isWorkstationElement(target) && workstationNextSlots
      ? { ...target, assignedEmployeeIds: workstationNextSlots }
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
      // Workstation `assignedEmployeeIds` is a SPARSE positional array
      // (length === positions). Cleanup means "every slot empty" — i.e.
      // an array of nulls of the same length, NOT a truncated `[]` (the
      // renderer iterates `0..positions` and would silently re-show
      // stale ids if the array were shorter than expected).
      if (foundElement.assignedEmployeeIds.some((id) => id !== null)) {
        cleaned = {
          ...foundElement,
          assignedEmployeeIds: Array.from({ length: foundElement.positions }, () => null),
        }
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
    // Sparse positional array — null out the slot the employee occupied
    // rather than filtering, which would shift everyone left and break
    // the slot ↔ index contract.
    if (el.assignedEmployeeIds.some((id) => id === employeeId)) {
      updated = {
        ...el,
        assignedEmployeeIds: el.assignedEmployeeIds.map((id) => (id === employeeId ? null : id)),
      }
    }
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

  // Capture the pre-delete element + employee snapshots BEFORE writing —
  // we need them for the cascade-delete undo toast. We capture only the
  // affected entries so undo doesn't blow away unrelated edits the user
  // made between the delete and the undo click.
  const cascadeChildIds: string[] = []
  for (const id of toDelete) {
    if (validIds.includes(id)) continue // skip the directly-deleted ids
    cascadeChildIds.push(id)
  }
  const wallsWithCascadeIds = validIds.filter((id) => {
    const el = elementsState[id]
    return el && isWallElement(el)
  })
  const shouldShowCascadeToast =
    wallsWithCascadeIds.length > 0 && cascadeChildIds.length > 0

  let cascadeSnapshot: {
    elements: Record<string, CanvasElement>
    employees: Record<string, Employee>
  } | null = null
  if (shouldShowCascadeToast) {
    const elemSnap: Record<string, CanvasElement> = {}
    for (const id of toDelete) {
      const el = elementsState[id]
      if (el) elemSnap[id] = el
    }
    const empSnap: Record<string, Employee> = {}
    for (const empId of employeesToUnassign) {
      const emp = employeesState[empId]
      if (emp) empSnap[empId] = emp
    }
    cascadeSnapshot = { elements: elemSnap, employees: empSnap }
  }

  // elementsStore is the temporal (zundo-tracked) store. Write elements first,
  // then employees — employees are excluded from the undo partialize so their
  // update can be applied separately without affecting the snapshot count.
  useElementsStore.setState({ elements: nextElements })
  useEmployeeStore.setState({ employees: nextEmployees })

  for (const id of toDelete) {
    void emit('element.delete', 'element', id, {})
  }

  // Cascade-delete toast: when deleting a wall also cascade-removed
  // attached doors/windows, surface a single info toast with an Undo
  // button so the user has visible feedback that children were removed
  // and a one-click recovery path. The toast's onClick re-merges the
  // captured snapshots back into the live stores — preserving any
  // unrelated edits the user made between the delete and the undo —
  // and dismisses the toast.
  if (shouldShowCascadeToast && cascadeSnapshot) {
    const wallCount = wallsWithCascadeIds.length
    const childCount = cascadeChildIds.length
    const wallLabel = wallCount === 1 ? 'wall' : 'walls'
    const childLabel = childCount === 1 ? 'attached element' : 'attached elements'
    const title =
      wallCount === 1
        ? `Wall and ${childCount} ${childLabel} deleted`
        : `${wallCount} ${wallLabel} and ${childCount} ${childLabel} deleted`
    const snapshot = cascadeSnapshot
    const toasts = useToastStore.getState()
    const toastId = toasts.push({
      tone: 'info',
      title,
      action: {
        label: 'Undo',
        onClick: () => {
          const cur = useElementsStore.getState().elements
          const restoredElements = { ...cur, ...snapshot.elements }
          useElementsStore.setState({ elements: restoredElements })
          const curEmps = useEmployeeStore.getState().employees
          const restoredEmps = { ...curEmps, ...snapshot.employees }
          useEmployeeStore.setState({ employees: restoredEmps })
          useToastStore.getState().dismiss(toastId)
        },
      },
    })
  }
}

/**
 * Remove a single vertex from a wall, cascading any doors/windows whose
 * `positionOnWall` falls on the removed segment(s) and surfacing the same
 * Undo-toast pattern as `deleteElements`. The whole operation lands in one
 * zundo snapshot so a single Cmd+Z restores the vertex AND every cascaded
 * child.
 *
 * Cascade rule (matches the recommendation in PR #156's planning notes):
 *
 *   - Endpoint vertex removed → drop the single segment that touches that
 *     endpoint. Doors/windows whose `positionOnWall` maps to that segment
 *     are cascade-deleted. (We don't try to re-anchor them onto the
 *     surviving wall by spatial proximity — the user just changed the
 *     wall's shape, the original anchor point is gone, and silently
 *     repositioning a door is more surprising than removing it. The
 *     Undo toast restores the door if the user wants it back.)
 *   - Interior vertex removed → segments (i-1) and (i) collapse into one.
 *     Doors/windows on either of those two original segments are
 *     cascade-deleted. Same rationale.
 *   - Wall would become degenerate (≤ 1 vertex) → fall back to the
 *     standard `deleteElements` path so the wall and ALL its children are
 *     removed in one go (and surface the existing wall-delete toast).
 *
 * `positionOnWall` is a parametric `[0, 1]` measured against the
 * concatenated length of straight segments. We use
 * `locateOnStraightSegments` to map each child's position to a segment
 * index and compare against the segments slated for removal.
 */
export function removeWallVertex(wallId: string, vertexIndex: number): void {
  const elementsState = useElementsStore.getState().elements
  const wall = elementsState[wallId]
  if (!wall || !isWallElement(wall) || wall.locked) return

  const vertexCount = wall.points.length / 2
  if (vertexIndex < 0 || vertexIndex >= vertexCount) return

  // Degenerate-wall path: fall back to the existing wall-delete cascade.
  // `removeVertex` returning null means "the resulting wall would have
  // < 2 vertices and isn't a wall any more" — same outcome as deleting
  // the whole element, so reuse the existing helper for one toast and
  // one undo entry.
  const removed = removeVertex(wall, vertexIndex)
  if (!removed) {
    deleteElements([wallId])
    // Clear the now-stale active-vertex state so a future Backspace doesn't
    // refer to a wall that no longer exists.
    useUIStore.getState().setActiveVertex(null)
    return
  }

  // Determine which ORIGINAL segment indices were removed. Endpoint
  // vertex i = 0           → segment 0 dropped.
  // Endpoint vertex i = N-1 → segment (N-2) dropped.
  // Interior vertex i      → segments (i-1) and (i) dropped (collapse).
  const originalSegCount = vertexCount - 1
  const removedSegments = new Set<number>()
  if (vertexIndex === 0) {
    removedSegments.add(0)
  } else if (vertexIndex === vertexCount - 1) {
    removedSegments.add(originalSegCount - 1)
  } else {
    removedSegments.add(vertexIndex - 1)
    removedSegments.add(vertexIndex)
  }

  // Find doors/windows attached to this wall whose anchor falls on one of
  // the removed segments. Children with arc anchors (positionOnWall on a
  // bulged segment) currently can't exist — door/window placement gates
  // on `findNearestStraightWallHit` and the `WallElement` schema only
  // permits anchoring against straight runs. If a future migration adds
  // arc-anchored children, `locateOnStraightSegments` returns null for
  // arc segments and we conservatively treat that as "remove" so an
  // orphaned-anchor child doesn't survive a vertex collapse.
  const childIdsToRemove: string[] = []
  for (const [childId, child] of Object.entries(elementsState)) {
    if (child.type !== 'door' && child.type !== 'window') continue
    const c = child as DoorElement | WindowElement
    if (c.parentWallId !== wallId) continue
    const located = locateOnStraightSegments(
      wall.points,
      wall.bulges,
      c.positionOnWall,
    )
    if (located === null || removedSegments.has(located.segmentIndex)) {
      childIdsToRemove.push(childId)
    }
  }

  // Snapshot pre-mutation so the Undo toast can restore the wall geometry
  // AND the cascaded children in one click. We snapshot the wall element
  // (not just its points/bulges) so a user who tweaked label/wallType
  // between the vertex delete and the undo doesn't lose those edits — the
  // undo merges into the live element map, restoring only what was
  // actually mutated by this call.
  const wallSnap: Record<string, CanvasElement> = { [wallId]: wall }
  const childSnap: Record<string, CanvasElement> = {}
  for (const id of childIdsToRemove) {
    const child = elementsState[id]
    if (child) childSnap[id] = child
  }

  // Apply: write the updated wall AND remove the cascaded children in one
  // store mutation so zundo records ONE entry. Going through the
  // store-internal `setState` rather than chaining `updateElement` +
  // `removeElement` lets the partialize step serialise the result
  // exactly once.
  const nextElements = { ...elementsState }
  nextElements[wallId] = removed
  for (const id of childIdsToRemove) delete nextElements[id]
  useElementsStore.setState({ elements: nextElements })

  // Audit log mirrors `deleteElements`: one event per cascaded child so a
  // downstream reporting layer can correlate "wall N's vertex was removed"
  // with the door/window deletions that fell out of it.
  for (const id of childIdsToRemove) {
    void emit('element.delete', 'element', id, {})
  }

  // Re-target the active vertex: the surviving wall has one fewer vertex,
  // and the index we just deleted no longer exists. Clamp the active
  // vertex to a sensible neighbour so the next Backspace doesn't no-op or
  // accidentally remove the wrong vertex; clear when the wall is selected
  // but no vertex makes sense to highlight.
  const survivingVertexCount = removed.points.length / 2
  if (survivingVertexCount >= 2) {
    const nextActive = Math.max(0, Math.min(vertexIndex, survivingVertexCount - 1))
    useUIStore.getState().setActiveVertex({
      wallId,
      vertexIndex: nextActive,
    })
  } else {
    useUIStore.getState().setActiveVertex(null)
  }

  // Cascade toast: only when at least one child was removed. A vertex
  // delete that didn't take any children is uneventful — no toast needed,
  // because the wall geometry change is already visible. Mirrors PR #155's
  // "wall deleted with N children" toast pattern but says "vertex" instead.
  if (childIdsToRemove.length > 0) {
    const childCount = childIdsToRemove.length
    const childLabel = childCount === 1 ? 'attached element' : 'attached elements'
    const title = `Vertex and ${childCount} ${childLabel} removed`
    const toasts = useToastStore.getState()
    const toastId = toasts.push({
      tone: 'info',
      title,
      action: {
        label: 'Undo',
        onClick: () => {
          const cur = useElementsStore.getState().elements
          // Restore: wall geometry first (overwrite the trimmed version
          // with the original), then re-add cascaded children. Going
          // through the elements map directly so a single setState
          // produces a single undo entry on the UNDO action itself.
          const restored = { ...cur, ...wallSnap, ...childSnap }
          useElementsStore.setState({ elements: restored })
          useToastStore.getState().dismiss(toastId)
        },
      },
    })
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
