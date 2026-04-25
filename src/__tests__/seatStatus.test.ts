import { describe, it, expect, beforeEach } from 'vitest'
import { deriveSeatStatus } from '../lib/seatStatus'
import type {
  DeskElement,
  WorkstationElement,
  PrivateOfficeElement,
} from '../types/elements'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'

// Minimal factory — just enough of a BaseElement to satisfy the checker.
function baseShape<T extends { type: string }>(partial: T): T & {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  locked: boolean
  groupId: null
  zIndex: number
  label: string
  visible: boolean
  style: { fill: string; stroke: string; strokeWidth: number; opacity: number }
} {
  return {
    id: 'el',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    ...partial,
  } as ReturnType<typeof baseShape<T>>
}

const desk = (overrides: Partial<DeskElement> = {}): DeskElement =>
  baseShape<DeskElement>({
    type: 'desk',
    deskId: 'D-1',
    assignedEmployeeId: null,
    capacity: 1,
    ...overrides,
  } as DeskElement)

const workstation = (overrides: Partial<WorkstationElement> = {}): WorkstationElement =>
  baseShape<WorkstationElement>({
    type: 'workstation',
    deskId: 'W-1',
    positions: 4,
    // Sparse positional default — length === positions, all empty.
    assignedEmployeeIds: [null, null, null, null],
    ...overrides,
  } as WorkstationElement)

const office = (overrides: Partial<PrivateOfficeElement> = {}): PrivateOfficeElement =>
  baseShape<PrivateOfficeElement>({
    type: 'private-office',
    deskId: 'O-1',
    capacity: 1,
    assignedEmployeeIds: [],
    ...overrides,
  } as PrivateOfficeElement)

describe('deriveSeatStatus — defaults', () => {
  it('unassigned desk derives to "unassigned"', () => {
    expect(deriveSeatStatus(desk())).toBe('unassigned')
  })

  it('assigned desk derives to "assigned"', () => {
    expect(deriveSeatStatus(desk({ assignedEmployeeId: 'e1' }))).toBe('assigned')
  })

  it('workstation with employees derives to "assigned"', () => {
    expect(
      deriveSeatStatus(workstation({ assignedEmployeeIds: ['e1'] })),
    ).toBe('assigned')
  })

  it('empty workstation derives to "unassigned"', () => {
    expect(deriveSeatStatus(workstation())).toBe('unassigned')
  })

  it('private office with employees derives to "assigned"', () => {
    expect(
      deriveSeatStatus(office({ assignedEmployeeIds: ['e1'] })),
    ).toBe('assigned')
  })
})

describe('deriveSeatStatus — overrides', () => {
  it('honours reserved override even when unassigned', () => {
    expect(
      deriveSeatStatus(desk({ seatStatus: 'reserved' })),
    ).toBe('reserved')
  })

  it('honours hot-desk override', () => {
    expect(
      deriveSeatStatus(desk({ seatStatus: 'hot-desk' })),
    ).toBe('hot-desk')
  })

  it('honours decommissioned override even when someone is assigned', () => {
    expect(
      deriveSeatStatus(
        desk({
          assignedEmployeeId: 'e1',
          seatStatus: 'decommissioned',
        }),
      ),
    ).toBe('decommissioned')
  })
})

describe('StatusBar occupancy math excludes decommissioned seats', () => {
  beforeEach(() => {
    useElementsStore.setState({ elements: {} })
    useUIStore.setState({ selectedIds: [] })
  })

  it('counts active desks but not decommissioned ones', () => {
    const d1 = desk({ id: 'd1' })
    const d2 = desk({
      id: 'd2',
      assignedEmployeeId: 'e1',
    })
    const d3 = desk({
      id: 'd3',
      assignedEmployeeId: 'e2',
      seatStatus: 'decommissioned',
    })
    useElementsStore.setState({
      elements: { d1, d2, d3 },
    } as unknown as Parameters<typeof useElementsStore.setState>[0])

    // Replicate the StatusBar's reducer shape so we don't need to mount
    // Konva in a unit test. The intent here is the policy, not the
    // rendering — verify the helper and the summing loop agree.
    let total = 0
    let assigned = 0
    for (const el of Object.values(useElementsStore.getState().elements)) {
      if (deriveSeatStatus(el) === 'decommissioned') continue
      if (el.type === 'desk') {
        total += 1
        if ((el as DeskElement).assignedEmployeeId !== null) assigned += 1
      }
    }
    expect(total).toBe(2)
    expect(assigned).toBe(1)
  })
})
