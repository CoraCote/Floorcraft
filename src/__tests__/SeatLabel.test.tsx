/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { Stage, Layer } from 'react-konva'
import {
  SeatLabel,
  ID_BADGE_BAND_H,
  accommodationAnchorFor,
  NARROW_SLOT_W,
  COMPACT_SLOT_W,
} from '../components/editor/Canvas/SeatLabel'
import { DeskRenderer } from '../components/editor/Canvas/DeskRenderer'
import { useCanvasStore } from '../stores/canvasStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useSeatDragStore } from '../stores/seatDragStore'
import { useProjectStore } from '../stores/projectStore'
import { DEFAULT_CANVAS_SETTINGS, SEAT_LABEL_STYLES } from '../types/project'
import type {
  DeskElement,
  WorkstationElement,
  PrivateOfficeElement,
} from '../types/elements'

// Same jsdom canvas shim as the other Konva-backed tests — Konva uses
// getContext('2d') internally on mount and jsdom doesn't implement it.
beforeAll(() => {
  const mockCtx = {
    scale: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    arcTo: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    fill: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    transform: () => {},
    setTransform: () => {},
    drawImage: () => {},
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    fillText: () => {},
    strokeText: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    clip: () => {},
    rect: () => {},
    isPointInPath: () => false,
    canvas: { width: 0, height: 0 },
  } as unknown as CanvasRenderingContext2D
  HTMLCanvasElement.prototype.getContext = (() =>
    mockCtx) as unknown as HTMLCanvasElement['getContext']
})

function mountLabel(node: React.ReactElement) {
  let stage: any = null
  render(
    <Stage width={400} height={400} ref={(s: any) => (stage = s)}>
      <Layer>{node}</Layer>
    </Stage>,
  )
  return stage
}

function desk(overrides: Partial<DeskElement> = {}): DeskElement {
  return {
    id: 'desk-1',
    type: 'desk',
    x: 0,
    y: 0,
    width: 120,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Desk',
    visible: true,
    style: { fill: '#FEF3C7', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: 'D-101',
    assignedEmployeeId: 'emp-1',
    capacity: 1,
    ...overrides,
  } as DeskElement
}

function workstation(overrides: Partial<WorkstationElement> = {}): WorkstationElement {
  return {
    id: 'ws-1',
    type: 'workstation',
    x: 0,
    y: 0,
    width: 240,
    height: 80,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Workstation',
    visible: true,
    style: { fill: '#FEF3C7', stroke: '#000', strokeWidth: 1, opacity: 1 },
    deskId: 'WS-1',
    positions: 4,
    assignedEmployeeIds: ['emp-1', '', 'emp-2', ''],
    ...overrides,
  } as WorkstationElement
}

function office(overrides: Partial<PrivateOfficeElement> = {}): PrivateOfficeElement {
  return {
    id: 'po-1',
    type: 'private-office',
    x: 0,
    y: 0,
    width: 160,
    height: 100,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: 'Private Office',
    visible: true,
    style: { fill: '#EFF6FF', stroke: '#3B82F6', strokeWidth: 2, opacity: 1 },
    deskId: 'PO-1',
    capacity: 1,
    assignedEmployeeIds: ['emp-1'],
    ...overrides,
  } as PrivateOfficeElement
}

function seedEmployees() {
  useEmployeeStore.setState({
    employees: {
      'emp-1': {
        id: 'emp-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        department: 'Engineering',
        status: 'active',
        leaveType: null,
        expectedReturnDate: null,
        coverageEmployeeId: null,
        leaveNotes: null,
        departureDate: null,
        accommodations: [],
        sensitivityTags: [],
        pendingStatusChanges: [],
      },
      'emp-2': {
        id: 'emp-2',
        name: 'Bob Smith',
        email: 'bob@example.com',
        department: 'Design',
        status: 'active',
        leaveType: null,
        expectedReturnDate: null,
        coverageEmployeeId: null,
        leaveNotes: null,
        departureDate: null,
        accommodations: [],
        sensitivityTags: [],
        pendingStatusChanges: [],
      },
    } as any,
    departmentColors: { Engineering: '#4F46E5', Design: '#10B981' } as any,
  } as any)
}

describe('SeatLabel — per-style unit coverage', () => {
  // For every variant, mount with both an assigned employee and an
  // empty seat and assert the Konva tree draws *something*. We don't
  // snapshot specific coordinates — that's too brittle for layout
  // changes — but we do assert that text nodes exist and carry the
  // expected body content so we catch regressions like a bad
  // `truncateToWidth` that swallows the whole name.
  SEAT_LABEL_STYLES.forEach((style) => {
    it(`[${style}] renders an assigned employee without crashing`, () => {
      const stage = mountLabel(
        <SeatLabel
          style={style}
          employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
          departmentColor="#4F46E5"
          width={120}
          height={60}
        />,
      )
      // Collect every Text node's text and assert the name renders
      // somewhere in the tree.
      const texts: string[] = []
      stage?.find('Text').forEach((t: any) => texts.push(t.text()))
      expect(texts.some((s) => s.includes('Jane'))).toBe(true)
    })

    it(`[${style}] renders an unassigned seat with "Open" placeholder`, () => {
      const stage = mountLabel(
        <SeatLabel
          style={style}
          employee={null}
          departmentColor={null}
          width={120}
          height={60}
        />,
      )
      const texts: string[] = []
      stage?.find('Text').forEach((t: any) => texts.push(t.text()))
      expect(texts.some((s) => s === 'Open')).toBe(true)
    })

    it(`[${style}] returns nothing for a degenerate 4x4 area`, () => {
      // The guard in SeatLabel short-circuits when width or height
      // falls below 10px — a workstation slot squeezed by the user
      // shouldn't emit a Konva node that overflows its bounds.
      const stage = mountLabel(
        <SeatLabel
          style={style}
          employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
          departmentColor="#4F46E5"
          width={4}
          height={4}
        />,
      )
      const texts: string[] = []
      stage?.find('Text').forEach((t: any) => texts.push(t.text()))
      expect(texts).toEqual([])
    })
  })

  it('[avatar] derives initials from a two-word name', () => {
    const stage = mountLabel(
      <SeatLabel
        style="avatar"
        employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
        departmentColor="#4F46E5"
        width={120}
        height={60}
      />,
    )
    const texts: string[] = []
    stage?.find('Text').forEach((t: any) => texts.push(t.text()))
    expect(texts).toContain('JD')
  })

  it('[avatar] collapses a single-word name to one initial', () => {
    const stage = mountLabel(
      <SeatLabel
        style="avatar"
        employee={{ id: 'e1', name: 'Cher', department: null }}
        departmentColor={null}
        width={120}
        height={60}
      />,
    )
    const texts: string[] = []
    stage?.find('Text').forEach((t: any) => texts.push(t.text()))
    expect(texts).toContain('C')
  })

  it('[card] paints a department header strip with uppercase label', () => {
    const stage = mountLabel(
      <SeatLabel
        style="card"
        employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
        departmentColor="#4F46E5"
        width={120}
        height={60}
      />,
    )
    const texts: string[] = []
    stage?.find('Text').forEach((t: any) => texts.push(t.text()))
    // The header upper-cases the department name.
    expect(texts).toContain('ENGINEERING')
  })

  it('[banner] shows the dept as an uppercase eyebrow', () => {
    const stage = mountLabel(
      <SeatLabel
        style="banner"
        employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
        departmentColor="#4F46E5"
        width={120}
        height={60}
      />,
    )
    const texts: string[] = []
    stage?.find('Text').forEach((t: any) => texts.push(t.text()))
    expect(texts).toContain('ENGINEERING')
  })
})

describe('DeskRenderer integration — style flows through store', () => {
  // The store-driven path is the one the canvas actually uses. Confirm
  // that flipping `seatLabelStyle` on `canvasStore.settings` takes
  // effect on the next render for each of the three seat types.
  beforeAll(() => {
    // Workstation renderer pulls `getDepartmentColor` off the store;
    // seed it once so every style test has colours to work with.
    seedEmployees()
    // `useVisibleEmployees` redacts names to initials when the viewer
    // lacks `viewPII` (the default `null` role fails closed). Promote
    // the test user to 'editor' so the full "Jane Doe" name flows
    // through to the SeatLabel instead of "J.D."
    useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
  })

  function mountDesk(el: DeskElement | WorkstationElement | PrivateOfficeElement) {
    let stage: any = null
    render(
      <Stage width={400} height={400} ref={(s: any) => (stage = s)}>
        <Layer>
          <DeskRenderer element={el} />
        </Layer>
      </Stage>,
    )
    return stage
  }

  SEAT_LABEL_STYLES.forEach((style) => {
    it(`[${style}] desk renders without crashing via store setting`, () => {
      // Reset the drag store so the DropTargetOutline doesn't
      // attach and complicate the node count — this test is about
      // the seat label alone.
      useSeatDragStore.setState({ draggingEmployeeId: null, hoveredSeatId: null } as any)
      useCanvasStore.setState({
        settings: { ...DEFAULT_CANVAS_SETTINGS, seatLabelStyle: style },
      })
      const stage = mountDesk(desk())
      const texts: string[] = []
      stage?.find('Text').forEach((t: any) => texts.push(t.text()))
      expect(texts.some((s) => s.includes('Jane'))).toBe(true)
    })

    it(`[${style}] workstation renders without crashing via store setting`, () => {
      useSeatDragStore.setState({ draggingEmployeeId: null, hoveredSeatId: null } as any)
      useCanvasStore.setState({
        settings: { ...DEFAULT_CANVAS_SETTINGS, seatLabelStyle: style },
      })
      const stage = mountDesk(workstation())
      const texts: string[] = []
      stage?.find('Text').forEach((t: any) => texts.push(t.text()))
      // Jane sits in slot 0; Bob sits in slot 2. At a minimum the
      // first employee's name (or its first-token form for narrow
      // slot-based avatar fallback) should appear somewhere.
      expect(texts.some((s) => s.includes('Jane') || s === 'J' || s === 'JD')).toBe(true)
      // Empty slots always surface as "Open".
      expect(texts.some((s) => s === 'Open')).toBe(true)
    })

    it(`[${style}] private office renders without crashing via store setting`, () => {
      useSeatDragStore.setState({ draggingEmployeeId: null, hoveredSeatId: null } as any)
      useCanvasStore.setState({
        settings: { ...DEFAULT_CANVAS_SETTINGS, seatLabelStyle: style },
      })
      const stage = mountDesk(office())
      const texts: string[] = []
      stage?.find('Text').forEach((t: any) => texts.push(t.text()))
      expect(texts.some((s) => s.includes('Jane'))).toBe(true)
    })

    it(`[${style}] decommissioned desk still renders label (status affects opacity only)`, () => {
      useSeatDragStore.setState({ draggingEmployeeId: null, hoveredSeatId: null } as any)
      useCanvasStore.setState({
        settings: { ...DEFAULT_CANVAS_SETTINGS, seatLabelStyle: style },
      })
      const stage = mountDesk(desk({ seatStatus: 'decommissioned' }))
      const texts: string[] = []
      stage?.find('Text').forEach((t: any) => texts.push(t.text()))
      // The label is still present — decommissioned is an opacity
      // tweak on the outer Rect, not a hide-the-label signal. Losing
      // the name would break "who used to sit here" wayfinding.
      expect(texts.some((s) => s.includes('Jane'))).toBe(true)
    })

    it(`[${style}] drag-in-flight overlay composes with the label`, () => {
      useSeatDragStore.setState({
        draggingEmployeeId: 'other-emp',
        hoveredSeatId: 'desk-1',
      } as any)
      useCanvasStore.setState({
        settings: { ...DEFAULT_CANVAS_SETTINGS, seatLabelStyle: style },
      })
      const stage = mountDesk(desk())
      const texts: string[] = []
      stage?.find('Text').forEach((t: any) => texts.push(t.text()))
      expect(texts.some((s) => s.includes('Jane'))).toBe(true)
      // Cleanup so it doesn't leak into sibling tests.
      useSeatDragStore.setState({
        draggingEmployeeId: null,
        hoveredSeatId: null,
      } as any)
    })
  })

  // --- Wave 15E: explicit overlap + crispness invariants ----------

  it('exports a non-zero ID_BADGE_BAND_H so renderers can reserve it', () => {
    expect(ID_BADGE_BAND_H).toBeGreaterThan(0)
  })

  it('accommodationAnchorFor pushes the badge below the strip on card', () => {
    expect(accommodationAnchorFor('card')).toBe('right-below-strip')
    expect(accommodationAnchorFor('pill')).toBe('top-right')
    expect(accommodationAnchorFor('avatar')).toBe('top-right')
    expect(accommodationAnchorFor('banner')).toBe('top-right')
  })

  SEAT_LABEL_STYLES.forEach((style) => {
    it(`[${style}] interior label content stays inside its given box`, () => {
      const stage = mountLabel(
        <SeatLabel
          style={style}
          employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
          departmentColor="#4F46E5"
          x={0}
          y={0}
          width={120}
          height={60}
        />,
      )
      // No Text node should report an x or y outside the [0, 120] / [0, 60]
      // bounds — that's what guarantees the label can't wander into the
      // ID-badge zone or off the seat edge.
      stage?.find('Text').forEach((t: any) => {
        expect(t.x()).toBeGreaterThanOrEqual(0)
        expect(t.y()).toBeGreaterThanOrEqual(-2)
        expect(t.x()).toBeLessThan(120 + 1)
        expect(t.y()).toBeLessThan(60 + 1)
      })
    })

    it(`[${style}] every Text uses the Inter font stack`, () => {
      const stage = mountLabel(
        <SeatLabel
          style={style}
          employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
          departmentColor="#4F46E5"
          width={120}
          height={60}
        />,
      )
      const fonts = new Set<string>()
      stage?.find('Text').forEach((t: any) => fonts.add(t.fontFamily()))
      // Either every Text node carries the explicit Inter stack, or the
      // tree contains zero Text nodes (e.g. degenerate-size guard) — but
      // never the Konva default Arial.
      fonts.forEach((f) => {
        expect(f).toMatch(/Inter/)
      })
    })

    it(`[${style}] every coordinate is whole-pixel`, () => {
      const stage = mountLabel(
        <SeatLabel
          style={style}
          employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
          departmentColor="#4F46E5"
          width={121} // odd width forces /2 = 60.5 into many call sites
          height={61}
        />,
      )
      const isWhole = (n: number) => Math.abs(n - Math.round(n)) < 1e-9
      stage?.find('Text').forEach((t: any) => {
        expect(isWhole(t.x())).toBe(true)
        expect(isWhole(t.y())).toBe(true)
      })
      stage?.find('Rect').forEach((rc: any) => {
        expect(isWhole(rc.x())).toBe(true)
        expect(isWhole(rc.y())).toBe(true)
      })
    })
  })

  it('[card] paints a department-coloured header rect', () => {
    const stage = mountLabel(
      <SeatLabel
        style="card"
        employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
        departmentColor="#4F46E5"
        width={120}
        height={60}
      />,
    )
    const rectFills: string[] = []
    stage?.find('Rect').forEach((rc: any) => rectFills.push(rc.fill()))
    expect(rectFills).toContain('#4F46E5')
  })

  it('[avatar] renders a 24px diameter chip on a sized seat', () => {
    const stage = mountLabel(
      <SeatLabel
        style="avatar"
        employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
        departmentColor="#4F46E5"
        width={120}
        height={60}
      />,
    )
    const widths: number[] = []
    stage?.find('Rect').forEach((rc: any) => widths.push(rc.width()))
    // 24 = the new chip diameter from 15E (was 22).
    expect(widths).toContain(24)
  })

  it('[banner] renders a 4px wide stripe on a normal-width seat', () => {
    const stage = mountLabel(
      <SeatLabel
        style="banner"
        employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
        departmentColor="#4F46E5"
        width={120}
        height={60}
      />,
    )
    // The stripe is the only Rect with width 4 in this tree.
    const stripeWidths: number[] = []
    stage?.find('Rect').forEach((rc: any) => {
      if (rc.fill() === '#4F46E5') stripeWidths.push(rc.width())
    })
    expect(stripeWidths).toContain(4)
  })

  it('[banner] degrades to a 3px stripe on a narrow workstation slot', () => {
    const stage = mountLabel(
      <SeatLabel
        style="banner"
        employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
        departmentColor="#4F46E5"
        width={NARROW_SLOT_W - 5}
        height={60}
        containerWidth={NARROW_SLOT_W - 5}
      />,
    )
    const stripeWidths: number[] = []
    stage?.find('Rect').forEach((rc: any) => {
      if (rc.fill() === '#4F46E5') stripeWidths.push(rc.width())
    })
    expect(stripeWidths).toContain(3)
  })

  it('[card → pill] degrades on a narrow workstation slot', () => {
    // At a slot width < COMPACT_SLOT_W, card should fall back to pill —
    // so the tree should NOT contain the card's white-body Rect with a
    // department stroke. Asserting via the absence of an "ENGINEERING"
    // header text is the simplest stable signal.
    const stage = mountLabel(
      <SeatLabel
        style="card"
        employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
        departmentColor="#4F46E5"
        width={COMPACT_SLOT_W - 5}
        height={60}
        containerWidth={COMPACT_SLOT_W - 5}
      />,
    )
    const texts: string[] = []
    stage?.find('Text').forEach((t: any) => texts.push(t.text()))
    expect(texts).not.toContain('ENGINEERING')
  })

  it('attenuated wraps the label in a 0.85-opacity Group', () => {
    const stage = mountLabel(
      <SeatLabel
        style="pill"
        employee={{ id: 'e1', name: 'Jane Doe', department: 'Engineering' }}
        departmentColor="#4F46E5"
        width={120}
        height={60}
        attenuated
      />,
    )
    const opacities: number[] = []
    stage?.find('Group').forEach((g: any) => opacities.push(g.opacity()))
    expect(opacities).toContain(0.85)
  })

  it('default (undefined) seatLabelStyle falls back to pill behaviour', () => {
    // The back-fill defends against legacy payloads where the field
    // was never written — a missing value must not break the
    // renderer. We clear the field explicitly and assert the desk
    // still mounts with the employee name visible.
    useSeatDragStore.setState({ draggingEmployeeId: null, hoveredSeatId: null } as any)
    useCanvasStore.setState({
      settings: { ...DEFAULT_CANVAS_SETTINGS, seatLabelStyle: undefined },
    })
    let stage: any = null
    render(
      <Stage width={400} height={400} ref={(s: any) => (stage = s)}>
        <Layer>
          <DeskRenderer element={desk()} />
        </Layer>
      </Stage>,
    )
    const texts: string[] = []
    stage?.find('Text').forEach((t: any) => texts.push(t.text()))
    expect(texts.some((s) => s.includes('Jane'))).toBe(true)
  })
})
