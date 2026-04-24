import { describe, it, expect } from 'vitest'
import { nanoid } from 'nanoid'
import { nextSeatNumber, getSeatLabel } from '../lib/seatNumbering'
import type {
  CanvasElement,
  DeskElement,
  WorkstationElement,
  PrivateOfficeElement,
  WallElement,
} from '../types/elements'

function desk(deskId: string, id = nanoid()): DeskElement {
  return {
    id, type: 'desk', x: 0, y: 0, width: 60, height: 40, rotation: 0,
    locked: false, groupId: null, zIndex: 0, label: 'Desk', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 2, opacity: 1 },
    deskId, assignedEmployeeId: null, capacity: 1,
  }
}

function workstation(deskId: string, id = nanoid()): WorkstationElement {
  return {
    id, type: 'workstation', x: 0, y: 0, width: 120, height: 40, rotation: 0,
    locked: false, groupId: null, zIndex: 0, label: 'Workstation', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 2, opacity: 1 },
    deskId, positions: 4, assignedEmployeeIds: [],
  }
}

function privateOffice(deskId: string, id = nanoid()): PrivateOfficeElement {
  return {
    id, type: 'private-office', x: 0, y: 0, width: 120, height: 120, rotation: 0,
    locked: false, groupId: null, zIndex: 0, label: 'Private Office', visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 2, opacity: 1 },
    deskId, capacity: 1, assignedEmployeeIds: [],
  }
}

function wall(id = nanoid()): WallElement {
  return {
    id, type: 'wall', x: 0, y: 0, width: 100, height: 4, rotation: 0,
    locked: false, groupId: null, zIndex: 0, label: 'Wall', visible: true,
    style: { fill: '#000', stroke: '#000', strokeWidth: 2, opacity: 1 },
    points: [0, 0, 100, 0], thickness: 4, connectedWallIds: [], wallType: 'solid',
  }
}

function mapOf(els: CanvasElement[]): Record<string, CanvasElement> {
  return Object.fromEntries(els.map((e) => [e.id, e]))
}

describe('nextSeatNumber', () => {
  it('starts at 1 when no assignable elements exist', () => {
    expect(nextSeatNumber({})).toBe('1')
    expect(nextSeatNumber(mapOf([wall()]))).toBe('1')
  })

  it('returns max+1 for a floor of numeric desks', () => {
    expect(nextSeatNumber(mapOf([desk('1'), desk('2'), desk('3')]))).toBe('4')
  })

  it('considers workstations and private offices too', () => {
    const els = mapOf([desk('1'), workstation('2'), privateOffice('3')])
    expect(nextSeatNumber(els)).toBe('4')
  })

  it('fills the gap at the top — does not reuse deleted numbers', () => {
    // Seats 1, 3, 5 exist. Next should be 6, not 2 or 4.
    const els = mapOf([desk('1'), desk('3'), desk('5')])
    expect(nextSeatNumber(els)).toBe('6')
  })

  it('ignores legacy "D-abc123" labels', () => {
    const els = mapOf([desk('D-abc123'), desk('D-999')])
    expect(nextSeatNumber(els)).toBe('1')
  })

  it('ignores "3abc" (parseInt would accept it)', () => {
    const els = mapOf([desk('3abc')])
    expect(nextSeatNumber(els)).toBe('1')
  })

  it('mixes numeric + legacy — counts only the numeric ones', () => {
    const els = mapOf([desk('1'), desk('D-foo'), desk('2'), desk('Reception')])
    expect(nextSeatNumber(els)).toBe('3')
  })

  it('handles whitespace-padded numeric labels', () => {
    const els = mapOf([desk(' 4 ')])
    expect(nextSeatNumber(els)).toBe('5')
  })

  it('does not count non-assignable elements', () => {
    // Walls and the like have no deskId at all — they shouldn't affect counting.
    const els = mapOf([wall(), wall(), desk('7')])
    expect(nextSeatNumber(els)).toBe('8')
  })
})

describe('getSeatLabel', () => {
  it('returns the deskId of the element referenced by seatId', () => {
    const d = desk('5')
    expect(getSeatLabel(d.id, mapOf([d]))).toBe('5')
  })

  it('falls back to a truncated id when the seat is missing', () => {
    // Stale reference after a delete, or a payload with a dangling seatId.
    expect(getSeatLabel('abcdef1234567', {})).toBe('abcd')
  })

  it('falls back when the referenced element is not assignable', () => {
    const w = wall()
    expect(getSeatLabel(w.id, mapOf([w]))).toBe(w.id.slice(0, 4))
  })

  it('handles legacy alphanumeric deskIds without modification', () => {
    const d = desk('D-101')
    expect(getSeatLabel(d.id, mapOf([d]))).toBe('D-101')
  })
})
