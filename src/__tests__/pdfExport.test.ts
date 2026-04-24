import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Konva from 'konva'
import type { CanvasElement } from '../types/elements'
import type { Floor } from '../types/floor'
import type { Employee } from '../types/employee'
import {
  buildLegend,
  buildFileName,
  buildWayfindingPdf,
  type LegendEntry,
} from '../lib/pdfExport'

// jsPDF touches the DOM in some operations; spy on the constructor via a
// module mock so we can assert what sections the exporter writes without
// actually rasterising anything.
const jsPdfCalls: Array<{ method: string; args: unknown[] }> = []
vi.mock('jspdf', () => {
  class FakePdf {
    internal = {
      pageSize: {
        getWidth: () => 841.89, // A4 landscape width in pt
        getHeight: () => 595.28,
      },
    }
    setFontSize(size: number) {
      jsPdfCalls.push({ method: 'setFontSize', args: [size] })
    }
    setFont(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setFont', args })
    }
    setTextColor(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setTextColor', args })
    }
    setDrawColor(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setDrawColor', args })
    }
    setFillColor(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setFillColor', args })
    }
    text(text: string, x: number, y: number) {
      jsPdfCalls.push({ method: 'text', args: [text, x, y] })
    }
    rect(...args: unknown[]) {
      jsPdfCalls.push({ method: 'rect', args })
    }
    line(...args: unknown[]) {
      jsPdfCalls.push({ method: 'line', args })
    }
    addImage(dataUrl: string, fmt: string, x: number, y: number, w: number, h: number) {
      jsPdfCalls.push({ method: 'addImage', args: [dataUrl, fmt, x, y, w, h] })
    }
    output(kind: string): Blob {
      jsPdfCalls.push({ method: 'output', args: [kind] })
      return new Blob(['%PDF-fake'], { type: 'application/pdf' })
    }
    save(name: string) {
      jsPdfCalls.push({ method: 'save', args: [name] })
    }
  }
  return { jsPDF: FakePdf, default: FakePdf }
})

function desk(id: string, overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 40,
    height: 30,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    ...overrides,
  } as CanvasElement
}

function wall(id: string): CanvasElement {
  return {
    id,
    type: 'wall',
    x: 0,
    y: 0,
    width: 100,
    height: 4,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: '',
    visible: true,
    points: [0, 0, 100, 0],
    style: { fill: '#000', stroke: '#000', strokeWidth: 4, opacity: 1 },
  } as CanvasElement
}

function conferenceRoom(id: string): CanvasElement {
  return {
    id,
    type: 'conference-room',
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: 'Boardroom',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  } as CanvasElement
}

function emp(id: string, overrides: Partial<Employee> = {}): Employee {
  return {
    id,
    name: id,
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
    seatId: null,
    floorId: null,
    pendingStatusChanges: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('buildLegend', () => {
  it('groups element types with counts, ignoring annotations', () => {
    const elements: CanvasElement[] = [
      desk('d1'),
      desk('d2'),
      desk('d3'),
      wall('w1'),
      conferenceRoom('c1'),
      // annotation — should be filtered out of the legend
      {
        id: 't1',
        type: 'text-label',
        x: 0, y: 0, width: 10, height: 10, rotation: 0,
        locked: false, groupId: null, zIndex: 0, label: 'note',
        visible: true,
        style: { fill: '#000', stroke: '#000', strokeWidth: 1, opacity: 1 },
      } as CanvasElement,
    ]

    const legend: LegendEntry[] = buildLegend(elements)
    const map = Object.fromEntries(legend.map((l) => [l.type, l.count]))
    expect(map['desk']).toBe(3)
    expect(map['wall']).toBe(1)
    expect(map['conference-room']).toBe(1)
    expect(map['text-label']).toBeUndefined()
  })

  it('returns entries sorted by count descending, then type ascending', () => {
    const elements: CanvasElement[] = [
      wall('w1'),
      desk('d1'),
      desk('d2'),
      conferenceRoom('c1'),
      conferenceRoom('c2'),
    ]
    const legend = buildLegend(elements)
    // desks=2, conference-room=2, wall=1 → ties broken alphabetically
    expect(legend.map((e) => e.type)).toEqual([
      'conference-room',
      'desk',
      'wall',
    ])
  })

  it('includes an "assigned seats" virtual entry when employees are given', () => {
    const elements: CanvasElement[] = [desk('d1'), desk('d2')]
    const employees: Employee[] = [
      emp('e1', { seatId: 'd1' }),
      emp('e2', { seatId: 'd2' }),
      emp('e3', { seatId: null }),
    ]
    const legend = buildLegend(elements, employees)
    const assigned = legend.find((e) => e.type === 'assigned-seats')
    expect(assigned?.count).toBe(2)
  })

  it('handles empty input without throwing', () => {
    expect(buildLegend([])).toEqual([])
  })
})

describe('buildFileName', () => {
  it('slugifies project name + floor name + ISO date', () => {
    const name = buildFileName('My Office', 'Floor 1', new Date('2026-04-24T12:00:00Z'))
    expect(name).toBe('my-office-floor-1-2026-04-24.pdf')
  })

  it('collapses repeated and edge separators', () => {
    const name = buildFileName('  Acme -- HQ  ', '3rd / Floor!', new Date('2026-01-02T00:00:00Z'))
    expect(name).toBe('acme-hq-3rd-floor-2026-01-02.pdf')
  })

  it('falls back to "floorplan" when both inputs slugify empty', () => {
    const name = buildFileName('', '', new Date('2026-04-24T00:00:00Z'))
    expect(name).toBe('floorplan-2026-04-24.pdf')
  })
})

describe('buildWayfindingPdf', () => {
  const fakeStage: Konva.Stage = {
    toDataURL: vi.fn(() => 'data:image/png;base64,AAAA'),
  } as unknown as Konva.Stage

  const floor: Floor = { id: 'f1', name: 'Floor 1', order: 0, elements: {} }
  const elements: CanvasElement[] = [desk('d1'), desk('d2'), wall('w1')]
  const employees: Employee[] = [emp('e1', { seatId: 'd1' })]

  beforeEach(() => {
    jsPdfCalls.length = 0
    vi.clearAllMocks()
  })

  it('writes title, timestamp, scale indicator, legend, and the raster image', () => {
    const blob = buildWayfindingPdf({
      stage: fakeStage,
      projectName: 'Acme HQ',
      floor,
      elements,
      employees,
      canvasSettings: {
        gridSize: 12,
        scale: 0.1,
        scaleUnit: 'ft',
        showGrid: true,
        showDimensions: false,
      },
      now: new Date('2026-04-24T15:30:00Z'),
    })

    const texts = jsPdfCalls
      .filter((c) => c.method === 'text')
      .map((c) => c.args[0] as string)

    // Title includes project + floor name
    expect(texts.some((t) => /Acme HQ/i.test(t) && /Floor 1/i.test(t))).toBe(true)
    // Timestamp line (ISO date prefix is enough)
    expect(texts.some((t) => /2026-04-24/.test(t))).toBe(true)
    // Scale indicator: references the scale unit
    expect(texts.some((t) => /scale/i.test(t) && /ft/.test(t))).toBe(true)
    // Legend includes the element types we passed
    expect(texts.some((t) => /desk/i.test(t))).toBe(true)
    expect(texts.some((t) => /wall/i.test(t))).toBe(true)

    // Raster image was embedded
    const images = jsPdfCalls.filter((c) => c.method === 'addImage')
    expect(images.length).toBe(1)

    // Output is a Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
  })

  it('calls stage.toDataURL with a pixelRatio for print resolution', () => {
    buildWayfindingPdf({
      stage: fakeStage,
      projectName: 'p',
      floor,
      elements: [],
      employees: [],
      canvasSettings: {
        gridSize: 12, scale: 1, scaleUnit: 'ft', showGrid: true, showDimensions: false,
      },
      now: new Date('2026-04-24T00:00:00Z'),
    })
    const calls = (fakeStage.toDataURL as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls.length).toBe(1)
    const [opts] = calls[0] as [{ pixelRatio?: number }]
    expect(opts?.pixelRatio).toBeGreaterThanOrEqual(2)
  })
})
