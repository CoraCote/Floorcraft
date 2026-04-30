import { describe, it, expect } from 'vitest'
import { getSeatLabel } from '../lib/seatNumbering'
import type { CanvasElement } from '../types/elements'

function desk(id: string, deskId: string, label = ''): CanvasElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label,
    visible: true,
    style: {},
    deskId,
    capacity: 1,
    assignedEmployeeId: null,
  } as unknown as CanvasElement
}

describe('getSeatLabel', () => {
  it('returns the user-set label when one is provided', () => {
    const elements = { e1: desk('e1', 'D-101', "Sara's corner") }
    expect(getSeatLabel('e1', elements)).toBe("Sara's corner")
  })

  it('falls back to deskId when label is empty', () => {
    const elements = { e1: desk('e1', 'D-101', '') }
    expect(getSeatLabel('e1', elements)).toBe('D-101')
  })

  it('treats whitespace-only label as empty', () => {
    const elements = { e1: desk('e1', 'D-101', '   ') }
    expect(getSeatLabel('e1', elements)).toBe('D-101')
  })

  it('falls back to a truncated raw id when the element is missing', () => {
    expect(getSeatLabel('abcdef1234', {})).toBe('abcd')
  })
})
