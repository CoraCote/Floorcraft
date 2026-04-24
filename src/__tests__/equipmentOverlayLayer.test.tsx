/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { Stage } from 'react-konva'
import { EquipmentOverlayLayer } from '../components/editor/Canvas/EquipmentOverlayLayer'
import { computeRects } from '../lib/equipmentOverlayRects'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import type { CanvasElement, DeskElement } from '../types/elements'
import type { Employee } from '../types/employee'

// Canvas mock — Konva paints through getContext('2d'); jsdom returns
// null for it. Mirrors the NeighborhoodLayer test setup.
beforeAll(() => {
  const mockCtx = {
    scale: () => {},
    clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
    arc: () => {}, arcTo: () => {}, bezierCurveTo: () => {}, quadraticCurveTo: () => {},
    fill: () => {}, stroke: () => {}, save: () => {}, restore: () => {},
    translate: () => {}, rotate: () => {}, transform: () => {}, setTransform: () => {},
    drawImage: () => {},
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    fillText: () => {}, strokeText: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    clip: () => {}, rect: () => {}, isPointInPath: () => false,
    canvas: { width: 0, height: 0 },
  } as unknown as CanvasRenderingContext2D
  HTMLCanvasElement.prototype.getContext = (() =>
    mockCtx) as unknown as HTMLCanvasElement['getContext']
})

function emp(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.id ?? 'emp-1',
    name: overrides.name ?? 'Test',
    email: '',
    department: null,
    team: null,
    title: null,
    managerId: null,
    employmentType: 'full-time',
    status: 'active',
    officeDays: [],
    startDate: null,
    endDate: null,
    leaveType: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    departureDate: null,
    equipmentNeeds: [],
    equipmentStatus: 'not-needed',
    photoUrl: null,
    tags: [],
    accommodations: [],
    sensitivityTags: [],
    pendingStatusChanges: [],
    seatId: null,
    floorId: null,
    createdAt: '2026-01-01',
    ...overrides,
  }
}

function desk(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: overrides.id ?? 'd1',
    type: 'desk',
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
    deskId: 'D-1',
    assignedEmployeeId: null,
    capacity: 1,
    ...overrides,
  }
}

function toMap<T extends { id: string }>(items: T[]): Record<string, T> {
  const m: Record<string, T> = {}
  for (const it of items) m[it.id] = it
  return m
}

describe('EquipmentOverlayLayer', () => {
  it('renders nothing when there are no desks', () => {
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <EquipmentOverlayLayer />
      </Stage>,
    )
    const allLayers = stage.getLayers()
    expect(allLayers).toHaveLength(1)
    expect(allLayers[0].find('Rect')).toHaveLength(0)
  })

  it('assigns one colour per desk matching its equipment-match status', () => {
    const e1 = emp({ id: 'e1', equipmentNeeds: ['monitor', 'standing-desk'] })
    const e2 = emp({ id: 'e2', equipmentNeeds: ['monitor'] })
    const e3 = emp({ id: 'e3', equipmentNeeds: ['docking-station'] })
    // ok: both needs present
    const dOk = desk({
      id: 'ok',
      assignedEmployeeId: 'e1',
      equipment: ['monitor', 'standing-desk'],
    })
    // partial: one met, one missing
    const dPartial = desk({
      id: 'partial',
      assignedEmployeeId: 'e1',
      equipment: ['monitor'],
    })
    // missing: none met
    const dMissing = desk({
      id: 'missing',
      assignedEmployeeId: 'e3',
      equipment: ['monitor'],
    })
    // na (unassigned) — should NOT emit a rect
    const dUnassigned = desk({ id: 'un', equipment: ['monitor'] })
    // na (no needs) — employee has no needs → no rect
    const dNoNeeds = desk({
      id: 'nn',
      assignedEmployeeId: 'e2-no-needs',
      equipment: ['monitor'],
    })
    const e2NoNeeds = emp({ id: 'e2-no-needs', equipmentNeeds: [] })

    const elements: Record<string, CanvasElement> = toMap([
      dOk,
      dPartial,
      dMissing,
      dUnassigned,
      dNoNeeds,
    ]) as unknown as Record<string, CanvasElement>
    const employees = toMap([e1, e2, e3, e2NoNeeds])

    const rects = computeRects(elements, employees)
    expect(rects).toHaveLength(3)

    const byId = new Map(rects.map((r) => [r.id, r]))
    // Green
    expect(byId.get('ok')?.color).toMatch(/16,\s*185,\s*129/)
    // Amber
    expect(byId.get('partial')?.color).toMatch(/245,\s*158,\s*11/)
    // Red
    expect(byId.get('missing')?.color).toMatch(/239,\s*68,\s*68/)
    // No rect for unassigned or needs-empty desks
    expect(byId.has('un')).toBe(false)
    expect(byId.has('nn')).toBe(false)
  })

  it('renders one Rect per non-"na" desk on the Konva Stage', () => {
    // Stub the stores — EquipmentOverlayLayer reads from elementsStore and
    // employeeStore directly. We import the real stores and hydrate them.
    const employee = emp({ id: 'e1', equipmentNeeds: ['monitor'] })
    const d = desk({ id: 'd1', assignedEmployeeId: 'e1', equipment: ['monitor'] })

    useElementsStore.setState({ elements: { [d.id]: d as unknown as CanvasElement } })
    useEmployeeStore.setState({ employees: { [employee.id]: employee } })

    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <EquipmentOverlayLayer />
      </Stage>,
    )
    const layer = stage.getLayers()[0]
    expect(layer.find('Rect')).toHaveLength(1)
  })
})
