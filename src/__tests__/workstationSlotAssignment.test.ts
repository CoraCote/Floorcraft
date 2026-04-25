import { describe, it, expect, beforeEach } from 'vitest'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { assignEmployee } from '../lib/seatAssignment'
import { computeWorkstationSlotIndex } from '../lib/workstationSlots'
import { loadAutoSave } from '../lib/offices/loadFromLegacyPayload'
import type { Employee } from '../types/employee'
import type { WorkstationElement } from '../types/elements'

/**
 * Tests for the per-slot workstation assignment feature.
 *
 * The data-model contract under test:
 *   `WorkstationElement.assignedEmployeeIds` is a SPARSE positional
 *   array. Length === `positions`; index `i` is the occupant of slot
 *   `i`, or `null` when the slot is empty.
 *
 * The behaviour under test:
 *   - Migration in `loadFromLegacyPayload` right-pads dense legacy
 *     payloads to the new shape (idempotent).
 *   - `assignEmployee(empId, wsId, floorId, slotIndex?)` places the
 *     employee at the requested slot (or first empty slot when no
 *     slotIndex is given), evicts the previous occupant of that slot,
 *     and frees any prior slot the same employee occupied on the
 *     same workstation.
 *   - `computeWorkstationSlotIndex` returns the correct column for
 *     any cursor position (including off-element cases).
 */

function emp(id: string, name: string): Employee {
  return {
    id,
    name,
    email: '',
    department: null,
    team: null,
    title: null,
    managerId: null,
    employmentType: 'full-time',
    officeDays: [],
    startDate: null,
    endDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: null,
    tags: [],
    accommodations: [],
    sensitivityTags: [],
    pendingStatusChanges: [],
    seatId: null,
    floorId: null,
    status: 'active',
    leaveType: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    departureDate: null,
    createdAt: new Date().toISOString(),
  } as unknown as Employee
}

function workstation(id: string, positions: number, occupants?: Array<string | null>): WorkstationElement {
  const slots: Array<string | null> = occupants
    ? [...occupants]
    : Array.from({ length: positions }, () => null)
  return {
    id,
    type: 'workstation',
    x: 0,
    y: 0,
    width: 240,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    visible: true,
    label: '',
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: 'W-' + id,
    positions,
    assignedEmployeeIds: slots,
  }
}

beforeEach(() => {
  useEmployeeStore.setState({
    employees: {
      e1: emp('e1', 'Alice'),
      e2: emp('e2', 'Bob'),
      e3: emp('e3', 'Carol'),
      e4: emp('e4', 'Dan'),
      e5: emp('e5', 'Eve'),
    },
    departmentColors: {},
  } as never)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
})

// --- Migration via loadAutoSave / migrateElements ----------------------

describe('migrateElements — workstation sparse positional array', () => {
  function writeAutoSave(payload: unknown): void {
    localStorage.setItem('floocraft-autosave', JSON.stringify(payload))
  }

  it('right-pads a dense legacy `string[]` to length === positions with nulls', () => {
    writeAutoSave({
      elements: {
        ws1: {
          id: 'ws1',
          type: 'workstation',
          positions: 4,
          assignedEmployeeIds: ['emp1', 'emp2'],
        },
      },
    })
    const loaded = loadAutoSave()
    expect(loaded).toBeTruthy()
    const ws = loaded!.elements!.ws1 as WorkstationElement
    expect(ws.assignedEmployeeIds).toEqual(['emp1', 'emp2', null, null])
  })

  it('passes through a payload already in the sparse shape (idempotent)', () => {
    writeAutoSave({
      elements: {
        ws1: {
          id: 'ws1',
          type: 'workstation',
          positions: 4,
          assignedEmployeeIds: ['emp1', null, 'emp3', null],
        },
      },
    })
    const loaded = loadAutoSave()
    const ws = loaded!.elements!.ws1 as WorkstationElement
    expect(ws.assignedEmployeeIds).toEqual(['emp1', null, 'emp3', null])
  })

  it('truncates an over-long legacy array to `positions` (defensive)', () => {
    writeAutoSave({
      elements: {
        ws1: {
          id: 'ws1',
          type: 'workstation',
          positions: 2,
          assignedEmployeeIds: ['emp1', 'emp2', 'emp3', 'emp4'],
        },
      },
    })
    const loaded = loadAutoSave()
    const ws = loaded!.elements!.ws1 as WorkstationElement
    expect(ws.assignedEmployeeIds).toHaveLength(2)
    expect(ws.assignedEmployeeIds).toEqual(['emp1', 'emp2'])
  })

  it('coerces empty/missing legacy array to all-null at length === positions', () => {
    writeAutoSave({
      elements: {
        ws1: {
          id: 'ws1',
          type: 'workstation',
          positions: 3,
          // missing assignedEmployeeIds entirely
        },
      },
    })
    const loaded = loadAutoSave()
    const ws = loaded!.elements!.ws1 as WorkstationElement
    expect(ws.assignedEmployeeIds).toEqual([null, null, null])
  })
})

// --- assignEmployee with slotIndex -------------------------------------

describe('assignEmployee — workstation slot semantics', () => {
  function seedWorkstation(ws: WorkstationElement): void {
    useElementsStore.setState({ elements: { [ws.id]: ws } })
    useFloorStore.setState({
      floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: { [ws.id]: ws } }],
      activeFloorId: 'f1',
    } as never)
  }

  it('places the employee at the first empty slot when no slotIndex is given', () => {
    seedWorkstation(workstation('w1', 4))
    assignEmployee('e1', 'w1', 'f1')
    const ws = useElementsStore.getState().elements['w1'] as WorkstationElement
    expect(ws.assignedEmployeeIds).toEqual(['e1', null, null, null])
  })

  it('places the employee at the requested slotIndex', () => {
    seedWorkstation(workstation('w1', 4))
    assignEmployee('e1', 'w1', 'f1', 2)
    const ws = useElementsStore.getState().elements['w1'] as WorkstationElement
    expect(ws.assignedEmployeeIds).toEqual([null, null, 'e1', null])
  })

  it('evicts the previous slot occupant when assigning over an occupied slot', () => {
    // Slot 2 starts occupied by e2.
    seedWorkstation(workstation('w1', 4, [null, null, 'e2', null]))
    useEmployeeStore.setState({
      employees: {
        ...useEmployeeStore.getState().employees,
        e2: { ...useEmployeeStore.getState().employees.e2, seatId: 'w1', floorId: 'f1' },
      },
    } as never)

    assignEmployee('e1', 'w1', 'f1', 2)

    const ws = useElementsStore.getState().elements['w1'] as WorkstationElement
    expect(ws.assignedEmployeeIds).toEqual([null, null, 'e1', null])
    // e2 is evicted from the seat — their employee record is nulled.
    const employees = useEmployeeStore.getState().employees
    expect(employees.e2.seatId).toBeNull()
    expect(employees.e2.floorId).toBeNull()
  })

  it('shuffling the same employee within the workstation frees the old slot', () => {
    seedWorkstation(workstation('w1', 4, ['e1', null, null, null]))
    useEmployeeStore.setState({
      employees: {
        ...useEmployeeStore.getState().employees,
        e1: { ...useEmployeeStore.getState().employees.e1, seatId: 'w1', floorId: 'f1' },
      },
    } as never)

    assignEmployee('e1', 'w1', 'f1', 3)

    const ws = useElementsStore.getState().elements['w1'] as WorkstationElement
    expect(ws.assignedEmployeeIds).toEqual([null, null, null, 'e1'])
  })

  it('is a no-op when the workstation is full and no slotIndex is given', () => {
    const filled: Array<string | null> = ['e1', 'e2', 'e3', 'e4']
    seedWorkstation(workstation('w1', 4, filled))
    // Pre-seed each occupant's employee record so the assign would
    // otherwise evict cleanly.
    useEmployeeStore.setState({
      employees: Object.fromEntries(
        Object.entries(useEmployeeStore.getState().employees).map(([id, e]) => [
          id,
          ['e1', 'e2', 'e3', 'e4'].includes(id)
            ? { ...e, seatId: 'w1', floorId: 'f1' }
            : e,
        ]),
      ),
    } as never)

    assignEmployee('e5', 'w1', 'f1') // no slotIndex, all full

    const ws = useElementsStore.getState().elements['w1'] as WorkstationElement
    // Workstation contents unchanged; e5 was not placed.
    expect(ws.assignedEmployeeIds).toEqual(filled)
    expect(useEmployeeStore.getState().employees.e5.seatId).toBeNull()
  })
})

// --- computeWorkstationSlotIndex ---------------------------------------

describe('computeWorkstationSlotIndex', () => {
  // 4-position workstation centred at x=200 with width=240 → slots are
  // 60px wide, spanning x∈[80, 320). Slot 0 = [80, 140), slot 1 = [140,
  // 200), slot 2 = [200, 260), slot 3 = [260, 320).
  const ws = { x: 200, width: 240, positions: 4 }

  it('returns 0 for cursor at the workstation left edge', () => {
    expect(computeWorkstationSlotIndex(80, ws)).toBe(0)
  })

  it('returns the right slot for a mid-slot cursor', () => {
    expect(computeWorkstationSlotIndex(110, ws)).toBe(0)
    expect(computeWorkstationSlotIndex(170, ws)).toBe(1)
    expect(computeWorkstationSlotIndex(230, ws)).toBe(2)
    expect(computeWorkstationSlotIndex(290, ws)).toBe(3)
  })

  it('snaps to the lower slot at an exact slot boundary', () => {
    // x=140 is the boundary between slots 0 and 1; the contract is
    // "left-inclusive, right-exclusive" so this lands in slot 1.
    expect(computeWorkstationSlotIndex(140, ws)).toBe(1)
    expect(computeWorkstationSlotIndex(200, ws)).toBe(2)
  })

  it('returns -1 when cursor is to the left of the workstation', () => {
    expect(computeWorkstationSlotIndex(50, ws)).toBe(-1)
  })

  it('returns -1 when cursor is to the right of the workstation', () => {
    expect(computeWorkstationSlotIndex(400, ws)).toBe(-1)
    // The right edge is exclusive — exactly `right` is "outside".
    expect(computeWorkstationSlotIndex(320, ws)).toBe(-1)
  })

  it('returns -1 when positions is zero (defensive)', () => {
    expect(computeWorkstationSlotIndex(150, { x: 200, width: 240, positions: 0 })).toBe(-1)
  })
})
