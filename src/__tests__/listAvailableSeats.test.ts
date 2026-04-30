import { describe, it, expect } from 'vitest'
import { listAvailableSeats } from '../lib/seats/listAvailableSeats'
import type { Floor } from '../types/floor'
import type { Employee } from '../types/employee'
import type { Neighborhood } from '../types/neighborhood'
import type { CanvasElement } from '../types/elements'

function emp(id: string, name: string, overrides: Partial<Employee> = {}): Employee {
  return {
    id,
    name,
    email: `${id}@test`,
    department: null,
    team: null,
    title: null,
    seatId: null,
    floorId: null,
    status: 'active',
    employmentType: null,
    managerId: null,
    officeDays: [],
    startDate: null,
    endDate: null,
    departureDate: null,
    tags: [],
    equipmentNeeds: [],
    equipmentStatus: null,
    photoUrl: null,
    ...overrides,
  } as Employee
}

function desk(id: string, x: number, y: number, occupant: string | null = null): CanvasElement {
  return {
    id,
    type: 'desk',
    x,
    y,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: null,
    visible: true,
    style: {},
    deskId: `D-${id}`,
    capacity: 1,
    assignedEmployeeId: occupant,
  } as unknown as CanvasElement
}

function bench(id: string, x: number, y: number, slots: Array<string | null>): CanvasElement {
  return {
    id,
    type: 'workstation',
    x,
    y,
    width: 80,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: null,
    visible: true,
    style: {},
    deskId: `WS-${id}`,
    positions: slots.length,
    assignedEmployeeIds: slots,
  } as unknown as CanvasElement
}

describe('listAvailableSeats', () => {
  it('returns one option per assignable element across every floor', () => {
    const floors: Floor[] = [
      {
        id: 'f1',
        name: 'Ground',
        order: 0,
        elements: { d1: desk('d1', 0, 0), d2: desk('d2', 50, 0) },
      },
      { id: 'f2', name: 'Roof', order: 1, elements: { d3: desk('d3', 0, 0) } },
    ]
    const out = listAvailableSeats(floors, {})
    expect(out).toHaveLength(3)
    expect(out.map((o) => o.elementId).sort()).toEqual(['d1', 'd2', 'd3'])
  })

  it('reports occupant names and capacity correctly for desks and workstations', () => {
    const employees: Record<string, Employee> = {
      e1: emp('e1', 'Ada Lovelace'),
      e2: emp('e2', 'Grace Hopper'),
    }
    const floors: Floor[] = [
      {
        id: 'f1',
        name: 'Ground',
        order: 0,
        elements: {
          d1: desk('d1', 0, 0, 'e1'),
          ws1: bench('ws1', 100, 0, ['e2', null, null]),
        },
      },
    ]
    const out = listAvailableSeats(floors, employees)
    const d1 = out.find((o) => o.elementId === 'd1')!
    const ws1 = out.find((o) => o.elementId === 'ws1')!
    expect(d1.capacity).toBe(1)
    expect(d1.occupied).toBe(1)
    expect(d1.occupantNames).toEqual(['Ada Lovelace'])
    expect(ws1.capacity).toBe(3)
    expect(ws1.occupied).toBe(1)
    expect(ws1.occupantNames).toEqual(['Grace Hopper'])
  })

  it('attaches a neighborhood name when a seat center lies inside a neighborhood', () => {
    const floors: Floor[] = [
      {
        id: 'f1',
        name: 'Ground',
        order: 0,
        elements: {
          inside: desk('inside', 100, 100),
          outside: desk('outside', 1000, 1000),
        },
      },
    ]
    const neighborhoods: Record<string, Neighborhood> = {
      n1: {
        id: 'n1',
        name: 'Engineering',
        color: '#000',
        x: 50,
        y: 50,
        width: 200,
        height: 200,
        floorId: 'f1',
      } as Neighborhood,
    }
    const out = listAvailableSeats(floors, {}, neighborhoods)
    expect(out.find((o) => o.elementId === 'inside')!.neighborhoodName).toBe('Engineering')
    expect(out.find((o) => o.elementId === 'outside')!.neighborhoodName).toBeNull()
  })

  it('prefers a non-empty element.label over the deskId for the display label', () => {
    const floors: Floor[] = [
      {
        id: 'f1',
        name: 'Ground',
        order: 0,
        elements: {
          d1: { ...desk('d1', 0, 0), label: "Sara's corner" } as unknown as CanvasElement,
          d2: desk('d2', 50, 0),
        },
      },
    ]
    const out = listAvailableSeats(floors, {})
    expect(out.find((o) => o.elementId === 'd1')!.deskId).toBe("Sara's corner")
    expect(out.find((o) => o.elementId === 'd2')!.deskId).toBe('D-d2')
  })

  it('skips non-assignable elements (walls, conference rooms, etc.)', () => {
    const wall: CanvasElement = {
      id: 'w1',
      type: 'wall',
      x: 0,
      y: 0,
      width: 100,
      height: 5,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: 0,
      label: null,
      visible: true,
      style: {},
      points: [0, 0, 100, 0],
      wallType: 'solid',
    } as unknown as CanvasElement
    const floors: Floor[] = [
      {
        id: 'f1',
        name: 'Ground',
        order: 0,
        elements: { w1: wall, d1: desk('d1', 0, 0) },
      },
    ]
    const out = listAvailableSeats(floors, {})
    expect(out).toHaveLength(1)
    expect(out[0].elementId).toBe('d1')
  })
})
