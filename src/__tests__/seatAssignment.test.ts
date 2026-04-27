/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { deleteElements, assignEmployee } from '../lib/seatAssignment'
import type {
  DeskElement,
  WallElement,
  DoorElement,
  WindowElement,
  DecorElement,
  BaseElement,
} from '../types/elements'

function makeBase(overrides: Partial<BaseElement>): BaseElement {
  return {
    id: overrides.id!,
    type: overrides.type!,
    x: 0, y: 0, width: 50, height: 50, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: '', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    ...overrides,
  }
}

function makeDesk(id: string): DeskElement {
  return {
    ...makeBase({ id, type: 'desk' }),
    type: 'desk',
    deskId: `D-${id}`,
    assignedEmployeeId: null,
    capacity: 1,
  } as DeskElement
}

function makeWall(id: string): WallElement {
  return {
    ...makeBase({ id, type: 'wall' }),
    type: 'wall',
    points: [0, 0, 100, 0],
    thickness: 5,
    wallType: 'solid',
  } as WallElement
}

function makeDoor(id: string, parentWallId: string): DoorElement {
  return {
    ...makeBase({ id, type: 'door' }),
    type: 'door',
    parentWallId,
    positionOnWall: 0.5,
    swingDirection: 'left',
    openAngle: 90,
  } as DoorElement
}

function makeWindow(id: string, parentWallId: string): WindowElement {
  return {
    ...makeBase({ id, type: 'window' }),
    type: 'window',
    parentWallId,
    positionOnWall: 0.3,
  } as WindowElement
}

function makeDecor(id: string): DecorElement {
  return {
    ...makeBase({ id, type: 'decor' }),
    type: 'decor',
    shape: 'armchair',
  } as DecorElement
}

beforeEach(() => {
  // Reset all three stores to a clean state
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  })
})

describe('deleteElements', () => {
  it('removes a plain decor element', () => {
    const d = makeDecor('dec1')
    useElementsStore.setState({ elements: { dec1: d } })
    deleteElements(['dec1'])
    expect(useElementsStore.getState().elements['dec1']).toBeUndefined()
  })

  it('removes multiple elements in a single call', () => {
    useElementsStore.setState({
      elements: { a: makeDecor('a'), b: makeDecor('b'), c: makeDecor('c') },
    })
    deleteElements(['a', 'c'])
    const remaining = useElementsStore.getState().elements
    expect(remaining['a']).toBeUndefined()
    expect(remaining['b']).toBeDefined()
    expect(remaining['c']).toBeUndefined()
  })

  it('unassigns employees when an assigned desk is deleted', () => {
    const desk = makeDesk('d1')
    useElementsStore.setState({ elements: { d1: desk } })
    useEmployeeStore.setState({
      employees: {
        e1: {
          id: 'e1', name: 'Alice', email: '', department: null, team: null, title: null,
          managerId: null, employmentType: 'full-time', officeDays: [], startDate: null, endDate: null,
          equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [],
          seatId: null, floorId: null, createdAt: new Date().toISOString(),
        } as any,
      },
    })
    assignEmployee('e1', 'd1', 'f1')
    expect(useEmployeeStore.getState().employees['e1'].seatId).toBe('d1')

    deleteElements(['d1'])
    expect(useElementsStore.getState().elements['d1']).toBeUndefined()
    expect(useEmployeeStore.getState().employees['e1'].seatId).toBeNull()
    expect(useEmployeeStore.getState().employees['e1'].floorId).toBeNull()
  })

  it('cascades wall deletion to attached doors and windows', () => {
    const wall = makeWall('w1')
    const door = makeDoor('door1', 'w1')
    const win = makeWindow('win1', 'w1')
    const unrelated = makeDecor('dec1')
    useElementsStore.setState({
      elements: { w1: wall, door1: door, win1: win, dec1: unrelated },
    })

    deleteElements(['w1'])
    const els = useElementsStore.getState().elements
    expect(els['w1']).toBeUndefined()
    expect(els['door1']).toBeUndefined()
    expect(els['win1']).toBeUndefined()
    expect(els['dec1']).toBeDefined()
  })

  it('does NOT delete locked elements (silently ignores them)', () => {
    const locked: DecorElement = { ...makeDecor('lk1'), locked: true }
    useElementsStore.setState({ elements: { lk1: locked } })
    deleteElements(['lk1'])
    expect(useElementsStore.getState().elements['lk1']).toBeDefined()
  })

  it('is a single undoable unit (one zundo snapshot)', () => {
    const wall = makeWall('w1')
    const door = makeDoor('door1', 'w1')
    useElementsStore.setState({ elements: { w1: wall, door1: door } })

    const temporal = useElementsStore.temporal.getState()
    const sizeBefore = temporal.pastStates.length
    deleteElements(['w1'])
    const sizeAfter = useElementsStore.temporal.getState().pastStates.length
    expect(sizeAfter).toBe(sizeBefore + 1)
  })
})
