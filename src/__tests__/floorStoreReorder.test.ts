import { describe, it, expect, beforeEach } from 'vitest'
import { useFloorStore } from '../stores/floorStore'
import type {
  CanvasElement,
  DeskElement,
  WorkstationElement,
  PrivateOfficeElement,
} from '../types/elements'

/**
 * Minimal element factories for the duplicate tests. We only care about
 * the assignment fields that duplicateFloor strips — every other field
 * is shape-compliant filler so structuredClone has something to copy.
 */
function makeDesk(id: string, assignedEmployeeId: string | null): DeskElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: 'D-1',
    assignedEmployeeId,
    capacity: 1,
  }
}

function makeWorkstation(
  id: string,
  // Legacy `string[]` shape accepted to keep the existing call sites
  // ergonomic. We pad with nulls to length === positions on the way in
  // so the constructed element respects the new sparse-positional
  // invariant on `WorkstationElement.assignedEmployeeIds`.
  occupants: string[],
): WorkstationElement {
  const positions = 4
  const padded: Array<string | null> = Array.from({ length: positions }, (_, i) =>
    i < occupants.length ? occupants[i] : null,
  )
  return {
    id,
    type: 'workstation',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: 'W-1',
    positions,
    assignedEmployeeIds: padded,
  }
}

function makePrivateOffice(id: string, assignedEmployeeIds: string[]): PrivateOfficeElement {
  return {
    id,
    type: 'private-office',
    x: 0,
    y: 0,
    width: 120,
    height: 120,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: 'PO-1',
    capacity: 2,
    assignedEmployeeIds,
  }
}

/**
 * Reset the floor store before each test. The store seeds itself with one
 * default floor at construction time — we replace that with a known
 * three-floor layout (orders 0, 1, 2) so every test starts from the same
 * baseline.
 */
beforeEach(() => {
  useFloorStore.setState({
    floors: [
      { id: 'a', name: 'A', order: 0, elements: {} },
      { id: 'b', name: 'B', order: 1, elements: {} },
      { id: 'c', name: 'C', order: 2, elements: {} },
    ],
    activeFloorId: 'a',
  })
})

describe('floorStore.reorderFloors', () => {
  it('moves a floor from one index to another and rewrites order on every floor', () => {
    const result = useFloorStore.getState().reorderFloors('a', 2)
    expect(result).toEqual({ fromIndex: 0, toIndex: 2 })

    const floors = [...useFloorStore.getState().floors].sort((x, y) => x.order - y.order)
    expect(floors.map((f) => f.id)).toEqual(['b', 'c', 'a'])
    // Order field must be rewritten so it stays a contiguous 0..N-1
    // sequence — otherwise later renumbering could collide.
    expect(floors.map((f) => f.order)).toEqual([0, 1, 2])
  })

  it('moves a floor backward (higher index → lower index)', () => {
    const result = useFloorStore.getState().reorderFloors('c', 0)
    expect(result).toEqual({ fromIndex: 2, toIndex: 0 })

    const floors = [...useFloorStore.getState().floors].sort((x, y) => x.order - y.order)
    expect(floors.map((f) => f.id)).toEqual(['c', 'a', 'b'])
  })

  it('is a no-op when the new index equals the current index', () => {
    const before = useFloorStore.getState().floors
    const result = useFloorStore.getState().reorderFloors('b', 1)
    expect(result).toBeNull()
    // Reference identity should be preserved on a no-op (we never called
    // set), so the floors array is the same instance as before.
    expect(useFloorStore.getState().floors).toBe(before)
  })

  it('returns null for an unknown floorId', () => {
    const result = useFloorStore.getState().reorderFloors('nonexistent', 0)
    expect(result).toBeNull()
  })

  it('clamps a too-large index to the last position', () => {
    const result = useFloorStore.getState().reorderFloors('a', 99)
    expect(result).toEqual({ fromIndex: 0, toIndex: 2 })
    const floors = [...useFloorStore.getState().floors].sort((x, y) => x.order - y.order)
    expect(floors.map((f) => f.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('floorStore.duplicateFloor', () => {
  beforeEach(() => {
    // Seed floor 'a' with three assignable elements so we can verify
    // strip-and-clone behavior.
    const elements: Record<string, CanvasElement> = {
      desk1: makeDesk('desk1', 'emp-1'),
      ws1: makeWorkstation('ws1', ['emp-2', 'emp-3']),
      po1: makePrivateOffice('po1', ['emp-4']),
    }
    useFloorStore.setState({
      floors: [
        { id: 'a', name: 'Ground', order: 0, elements },
        { id: 'b', name: 'B', order: 1, elements: {} },
      ],
      activeFloorId: 'b',
    })
  })

  it('creates a new floor whose name ends with "copy"', () => {
    const result = useFloorStore.getState().duplicateFloor('a')
    expect(result).not.toBeNull()
    const newFloor = useFloorStore.getState().floors.find((f) => f.id === result!.newId)
    expect(newFloor).toBeDefined()
    expect(newFloor!.name).toBe('Ground copy')
  })

  it('inserts the duplicate immediately after the source in order', () => {
    useFloorStore.getState().duplicateFloor('a')
    const floors = [...useFloorStore.getState().floors].sort((x, y) => x.order - y.order)
    // Source 'a' is at index 0, so duplicate should land at index 1
    // ahead of the existing 'b'.
    expect(floors[0].id).toBe('a')
    expect(floors[1].name).toBe('Ground copy')
    expect(floors[2].id).toBe('b')
    expect(floors.map((f) => f.order)).toEqual([0, 1, 2])
  })

  it('clones every element from the source — same element count', () => {
    const result = useFloorStore.getState().duplicateFloor('a')
    const newFloor = useFloorStore.getState().floors.find((f) => f.id === result!.newId)!
    expect(Object.keys(newFloor.elements).length).toBe(3)
  })

  it('cloned elements have fresh ids (no overlap with source ids)', () => {
    const result = useFloorStore.getState().duplicateFloor('a')
    const newFloor = useFloorStore.getState().floors.find((f) => f.id === result!.newId)!
    const sourceIds = new Set(['desk1', 'ws1', 'po1'])
    for (const id of Object.keys(newFloor.elements)) {
      expect(sourceIds.has(id)).toBe(false)
    }
    // And the element's own `id` field matches its key.
    for (const [key, el] of Object.entries(newFloor.elements)) {
      expect(el.id).toBe(key)
    }
  })

  it('strips assignedEmployeeId from cloned desks', () => {
    const result = useFloorStore.getState().duplicateFloor('a')
    const newFloor = useFloorStore.getState().floors.find((f) => f.id === result!.newId)!
    const desks = Object.values(newFloor.elements).filter(
      (el): el is DeskElement => el.type === 'desk',
    )
    expect(desks.length).toBe(1)
    expect(desks[0].assignedEmployeeId).toBeNull()
  })

  it('strips assignedEmployeeIds from cloned workstations', () => {
    const result = useFloorStore.getState().duplicateFloor('a')
    const newFloor = useFloorStore.getState().floors.find((f) => f.id === result!.newId)!
    const workstations = Object.values(newFloor.elements).filter(
      (el): el is WorkstationElement => el.type === 'workstation',
    )
    expect(workstations.length).toBe(1)
    // Sparse positional contract — the cloned bench keeps the same
    // capacity (length === positions) but every slot is null.
    expect(workstations[0].assignedEmployeeIds).toEqual([null, null, null, null])
  })

  it('strips assignedEmployeeIds from cloned private offices', () => {
    const result = useFloorStore.getState().duplicateFloor('a')
    const newFloor = useFloorStore.getState().floors.find((f) => f.id === result!.newId)!
    const offices = Object.values(newFloor.elements).filter(
      (el): el is PrivateOfficeElement => el.type === 'private-office',
    )
    expect(offices.length).toBe(1)
    expect(offices[0].assignedEmployeeIds).toEqual([])
  })

  it('does not mutate the source floor (assignments preserved on original)', () => {
    useFloorStore.getState().duplicateFloor('a')
    const source = useFloorStore.getState().floors.find((f) => f.id === 'a')!
    const desk = source.elements['desk1'] as DeskElement
    expect(desk.assignedEmployeeId).toBe('emp-1')
    const ws = source.elements['ws1'] as WorkstationElement
    // The makeWorkstation helper pads occupants out to length ===
    // positions; only the first two slots are filled here.
    expect(ws.assignedEmployeeIds).toEqual(['emp-2', 'emp-3', null, null])
  })

  it('returns null for an unknown floorId', () => {
    const result = useFloorStore.getState().duplicateFloor('nonexistent')
    expect(result).toBeNull()
  })

  it('uses the provided sourceElements snapshot when supplied (active floor case)', () => {
    // Simulate "duplicate the active floor" — caller passes the live
    // elementsStore snapshot since floorStore's stored copy may be stale.
    const liveSnapshot: Record<string, CanvasElement> = {
      live1: makeDesk('live1', null),
      live2: makeDesk('live2', null),
    }
    const result = useFloorStore.getState().duplicateFloor('a', liveSnapshot)
    const newFloor = useFloorStore.getState().floors.find((f) => f.id === result!.newId)!
    // The clone reflects the snapshot (2 elements), not the stored copy (3).
    expect(Object.keys(newFloor.elements).length).toBe(2)
  })
})
