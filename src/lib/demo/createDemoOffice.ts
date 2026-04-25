import { nanoid } from 'nanoid'
import type {
  CanvasElement,
  DeskElement,
  WallElement,
  DoorElement,
  WindowElement,
  ConferenceRoomElement,
  PhoneBoothElement,
  CommonAreaElement,
  PlantElement,
  SofaElement,
  PrivateOfficeElement,
  WorkstationElement,
  TableElement,
} from '../../types/elements'
import {
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'
import type { Employee, Accommodation } from '../../types/employee'
import type { Floor } from '../../types/floor'
import type { Neighborhood } from '../../types/neighborhood'
import type { Annotation } from '../../types/annotations'
import { DEFAULT_CANVAS_SETTINGS } from '../../types/project'

/**
 * Serialized shape the Supabase `offices.payload` column holds. Mirrors
 * `buildCurrentPayload` in `useOfficeSync.ts` — if that shape drifts the
 * demo will still save but will fail to rehydrate cleanly, so keeping
 * them in lockstep matters.
 *
 * Wave 17B upgraded this from a single-floor seed to a three-floor,
 * ~45-person showcase so the "try demo office" entry point delivers a
 * meaningfully populated plan. The broad field list below is a superset
 * of what the old demo wrote; every field corresponds to a top-level
 * payload slot `ProjectShell` hydrates from on load.
 */
export interface DemoOfficePayload {
  version: 2
  elements: Record<string, CanvasElement>
  employees: Record<string, Employee>
  departmentColors: Record<string, string>
  floors: Floor[]
  activeFloorId: string
  settings: typeof DEFAULT_CANVAS_SETTINGS
  neighborhoods: Record<string, Neighborhood>
  annotations: Record<string, Annotation>
}

// ---------------------------------------------------------------------------
// Department palette — a single source of truth so neighborhoods on the
// engineering floor, desk dept-color tints, and the team legend all line up
// without the visual dissonance that comes from hand-picking colors in three
// separate places. Ordering here is intentional: primaries first (seated most
// heavily on the engineering floor), support roles after.
// ---------------------------------------------------------------------------

const DEPARTMENTS = {
  Engineering: '#3B82F6', // blue — primary engineering neighborhoods
  Design: '#8B5CF6', // violet — leadership floor design pod
  Product: '#EC4899', // pink — cross-floor product squad
  Operations: '#10B981', // emerald — ground floor ops
  People: '#F59E0B', // amber — ground floor HR
  Finance: '#64748B', // slate — leadership floor
  Marketing: '#EF4444', // red — ground floor
} as const

type Department = keyof typeof DEPARTMENTS

// Neighborhood palette on the engineering floor — not a 1:1 dept map because
// engineering is split into sub-squads (Frontend / Backend / DevOps /
// Platform) that each carry their own color tint inside the "Engineering"
// dept bucket. Kept separate from DEPARTMENTS so the dept legend doesn't
// balloon to seven sub-squads.
const ENG_SQUAD_COLORS = {
  'Frontend squad': '#3B82F6', // blue
  'Backend core': '#8B5CF6', // violet (distinct from Design on purpose — these
  // live on different floors so a color reuse here doesn't create visual
  // collision on any single canvas)
  'DevOps/SRE': '#10B981', // green
  'Platform': '#F59E0B', // amber
} as const

// ---------------------------------------------------------------------------
// Element factories. Every builder returns a fully-populated CanvasElement
// so callers can push the result straight into the per-floor element map.
// Defaults mirror the shapes `ELEMENT_DEFAULTS` and the various renderers
// expect — deviating here would mean a demo that loads but looks off.
// ---------------------------------------------------------------------------

function baseStyle(fill: string, stroke: string, strokeWidth = 2) {
  return { fill, stroke, strokeWidth, opacity: 1 }
}

function makeWall(
  x: number,
  y: number,
  points: number[],
  label: string,
  opts: { bulges?: number[]; wallType?: WallElement['wallType'] } = {},
): WallElement {
  // Compute bounding box from the points — the renderer uses x/y/width/height
  // for hit tests and selection bounds. We store x/y as the offset the caller
  // passes and derive width/height from the point extents so the math stays
  // simple.
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < points.length; i += 2) {
    xs.push(points[i])
    ys.push(points[i + 1])
  }
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  return {
    id: nanoid(),
    type: 'wall',
    x,
    y,
    width: Math.max(width, 8),
    height: Math.max(height, 8),
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label,
    visible: true,
    style: baseStyle('#9CA3AF', '#4B5563'),
    points,
    bulges: opts.bulges,
    thickness: 8,
    connectedWallIds: [],
    wallType: opts.wallType ?? 'solid',
  }
}

function makeDoor(
  x: number,
  y: number,
  parentWallId: string,
  positionOnWall: number,
  label: string,
): DoorElement {
  return {
    id: nanoid(),
    type: 'door',
    x,
    y,
    width: 32,
    height: 8,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label,
    visible: true,
    style: baseStyle('#F3F4F6', '#6B7280'),
    parentWallId,
    positionOnWall,
    swingDirection: 'right',
    openAngle: 90,
  }
}

function makeWindow(
  x: number,
  y: number,
  parentWallId: string,
  positionOnWall: number,
  width: number,
  label: string,
): WindowElement {
  return {
    id: nanoid(),
    type: 'window',
    x,
    y,
    width,
    height: 8,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label,
    visible: true,
    style: baseStyle('#DBEAFE', '#2563EB'),
    parentWallId,
    positionOnWall,
  }
}

function makeDesk(
  x: number,
  y: number,
  deskId: string,
  opts: { equipment?: string[]; label?: string } = {},
): DeskElement {
  return {
    id: nanoid(),
    type: 'desk',
    x,
    y,
    width: 72,
    height: 48,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 2,
    label: opts.label ?? 'Desk',
    visible: true,
    style: baseStyle('#FEF3C7', '#D97706'),
    deskId,
    assignedEmployeeId: null,
    capacity: 1,
    equipment: opts.equipment,
  }
}

function makeWorkstation(
  x: number,
  y: number,
  deskId: string,
  positions: number,
  opts: { equipment?: string[]; label?: string; width?: number; height?: number } = {},
): WorkstationElement {
  return {
    id: nanoid(),
    type: 'workstation',
    x,
    y,
    width: opts.width ?? 72 * positions,
    height: opts.height ?? 48,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 2,
    label: opts.label ?? `Workstation (${positions})`,
    visible: true,
    style: baseStyle('#FEF3C7', '#D97706'),
    deskId,
    positions,
    // Sparse positional array — `loadFromLegacyPayload` enforces this
    // invariant on load, but constructing it correctly here keeps
    // freshly-seeded demo offices identical to migrated ones.
    assignedEmployeeIds: Array.from({ length: positions }, () => null),
    equipment: opts.equipment,
  }
}

function makePrivateOffice(
  x: number,
  y: number,
  width: number,
  height: number,
  deskId: string,
  label: string,
  opts: { capacity?: 1 | 2; equipment?: string[] } = {},
): PrivateOfficeElement {
  return {
    id: nanoid(),
    type: 'private-office',
    x,
    y,
    width,
    height,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 2,
    label,
    visible: true,
    style: baseStyle('#E0E7FF', '#4338CA'),
    deskId,
    capacity: opts.capacity ?? 1,
    assignedEmployeeIds: [],
    equipment: opts.equipment,
  }
}

function makeConferenceRoom(
  x: number,
  y: number,
  width: number,
  height: number,
  name: string,
  capacity: number,
): ConferenceRoomElement {
  return {
    id: nanoid(),
    type: 'conference-room',
    x,
    y,
    width,
    height,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 2,
    label: name,
    visible: true,
    style: baseStyle('#DBEAFE', '#2563EB'),
    roomName: name,
    capacity,
  }
}

function makePhoneBooth(x: number, y: number, label: string): PhoneBoothElement {
  return {
    id: nanoid(),
    type: 'phone-booth',
    x,
    y,
    width: 60,
    height: 60,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 2,
    label,
    visible: true,
    style: baseStyle('#F3E8FF', '#7C3AED'),
  }
}

function makeCommonArea(
  x: number,
  y: number,
  width: number,
  height: number,
  name: string,
): CommonAreaElement {
  return {
    id: nanoid(),
    type: 'common-area',
    x,
    y,
    width,
    height,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: name,
    visible: true,
    style: baseStyle('#D1FAE5', '#059669'),
    areaName: name,
  }
}

function makePlant(x: number, y: number): PlantElement {
  return {
    id: nanoid(),
    type: 'plant',
    x,
    y,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Plant',
    visible: true,
    style: baseStyle('#BBF7D0', '#16A34A'),
  }
}

function makeSofa(x: number, y: number, width = 120, height = 56): SofaElement {
  return {
    id: nanoid(),
    type: 'sofa',
    x,
    y,
    width,
    height,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 3,
    label: 'Sofa',
    visible: true,
    style: baseStyle('#E5E7EB', '#4B5563'),
  }
}

function makeConferenceTable(
  x: number,
  y: number,
  width = 160,
  height = 80,
  seatCount = 8,
): TableElement {
  return {
    id: nanoid(),
    type: 'table-conference',
    x,
    y,
    width,
    height,
    rotation: 0,
    locked: false,
    groupId: null,
    // zIndex 3 — strictly higher than the conference room (zIndex 2) that
    // visually contains this table, so the table always paints on top.
    // Equal zIndex with the room would tie render order and let the table
    // flicker under its container during selection / drag operations.
    zIndex: 3,
    label: 'Conference table',
    visible: true,
    style: baseStyle('#FAFAF9', '#78716C'),
    seatCount,
    seatLayout: 'around',
    seats: [],
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers. Every CanvasElement uses CENTER-ORIGIN x/y — the
// renderer translates a Group to (el.x, el.y) and the per-type renderer
// draws at (-width/2, -height/2). The original demo layout author leaked
// top-left-style coordinates into a few makeCommonArea / makeConferenceTable
// calls, putting the reception in the negative quadrant and tables hanging
// off the edge of their rooms. These helpers make the center-origin
// convention explicit at the call site.
// ---------------------------------------------------------------------------

/**
 * Given a parent's center + an offset from that center, return absolute
 * (cx, cy) coords for the child. Useful when laying out desks around a
 * pod's central table — the offsets are intuitive (x=-180 means "180
 * units left of pod center") instead of top-left-relative.
 */
function offsetInside(
  parentCx: number,
  parentCy: number,
  offsetX: number,
  offsetY: number,
): [number, number] {
  return [parentCx + offsetX, parentCy + offsetY]
}

// ---------------------------------------------------------------------------
// Per-floor builders. Each returns the element list, the neighborhoods
// attached to the floor, and any per-floor annotations so the top-level
// builder can stitch them onto the aggregate payload.
//
// Floor geometry notes — scale is 1px = 0.25ft (DEFAULT_CANVAS_SETTINGS.scale
// is 1; we keep it the same as other offices for consistency with the roster
// distance column). A ~1200-wide canvas reads as a ~80-ft-wide floor — a
// reasonable small-office footprint. Each floor uses the same canvas
// dimensions so the minimap + floor switcher don't jump between plans.
// ---------------------------------------------------------------------------

interface FloorBuild {
  floor: Floor
  neighborhoods: Neighborhood[]
  annotations: Annotation[]
  /** Ordered list of assignable seat element ids (for seat allocation). */
  seatIds: string[]
}

/**
 * Ground floor — the entrance, conference rooms, kitchen, reception, and a
 * mix of workstations + phone booths. This is the first-impression floor,
 * so it's deliberately the most varied in element types: walls, doors,
 * windows, a round conference table, a couch, plants, and a hot-desk
 * bench to show off workstations as distinct from 1:1 desks.
 *
 * Layout (canvas 1200x800, all coordinates are CENTER-ORIGIN — see
 * ElementRenderer.tsx):
 *
 *   y=0  ┌──────────────────────────────────────────────┐
 *        │ Reception │  [Odyssey] [Atlas] │  (north)    │
 *        │  + sofa   │                     │             │
 *   y=200├───────────┴─────────────────────┴─────────────┤
 *        │ Phone booths   ·   bullpen   ·                │
 *        │  Priv offices                                 │
 *        │   on west ·   workstation bench   · kitchen   │
 *        │                                               │
 *        │   south desks (2x3)                           │
 *  y=800 └──────────────────────────────────────────────┘
 *
 * Why these specific centers (the previous code passed top-left-style
 * coords into makeCommonArea, putting reception at AABB [-130..210,
 * -10..90] — half off the canvas):
 *   - Reception: center (170, 80), 280x100 → AABB [30..310, 30..130].
 *   - Odyssey: center (520, 160), 220x180 → AABB [410..630, 70..250].
 *     Conference table centered EXACTLY at (520, 160) so the table is
 *     visually inside the room and table.zIndex (3) > room.zIndex (2).
 *   - Atlas: center (820, 160), 200x180 → AABB [720..920, 70..250].
 *   - Phone booths: 4 booths flanking conference rooms.
 *   - Private offices: 4 along west edge (south of reception). Each
 *     center at x=110 (so AABB x runs 30..190, just inside the wall).
 *   - Workstation bench: center (560, 480), 432x54 hot-desk row.
 *   - 6 desks (2 rows × 3): south bullpen at y=620 and y=700.
 *   - Kitchen/Lounge common area encloses the south-east corner; the
 *     6 south desks live INSIDE this common area's AABB so the
 *     "every desk inside some zone" invariant holds.
 */
function buildGroundFloor(): FloorBuild {
  const els: CanvasElement[] = []
  const seatIds: string[] = []
  const floorId = nanoid()

  // Perimeter walls — one intentional angled segment in the top-right so the
  // demo shows off non-rectilinear plans. Canvas is 1200x800.
  const topWall = makeWall(
    0,
    0,
    [0, 0, 900, 0, 1000, 60, 1200, 60],
    'North wall',
  )
  const rightWall = makeWall(1192, 60, [0, 0, 0, 740], 'East wall')
  const bottomWall = makeWall(0, 800, [0, 0, 1200, 0], 'South wall')
  const leftWall = makeWall(0, 0, [0, 0, 0, 800], 'West wall')
  els.push(topWall, rightWall, bottomWall, leftWall)

  // Doors on the exterior — main entrance on the south wall, side exit on
  // the east, plus a stairwell on the west connecting upper floors.
  els.push(makeDoor(600, 796, bottomWall.id, 0.5, 'Main entrance'))
  els.push(makeDoor(1188, 400, rightWall.id, 0.42, 'Side exit'))
  els.push(makeDoor(4, 400, leftWall.id, 0.5, 'Stairwell'))

  // Windows on the east wall — facing the street.
  els.push(
    makeWindow(1188, 250, rightWall.id, 0.24, 80, 'Window'),
    makeWindow(1188, 600, rightWall.id, 0.7, 80, 'Window'),
  )
  // Window on the angled north wall.
  els.push(makeWindow(500, 4, topWall.id, 0.5, 120, 'Window'))

  // Reception area (top-left). Center (170, 80), 280x100 →
  // AABB [30..310, 30..130]. Sits comfortably inside the floor with a
  // 30px margin from west/north walls.
  els.push(makeCommonArea(170, 80, 280, 100, 'Reception'))
  // Sofa centered inside the reception common area. (170, 95) keeps the
  // sofa AABB [100..240, 75..115] fully inside reception [30..310, 30..130].
  els.push(makeSofa(170, 95, 140, 40))
  // Plant at NE corner of reception.
  els.push(makePlant(290, 60))

  // Conference rooms along the top. Odyssey (520, 160) 220x180 with the
  // table centered EXACTLY at (520, 160) — same coords as the room, smaller
  // size (160x100) so the table AABB [440..600, 110..210] is fully inside
  // the room AABB [410..630, 70..250].
  const odyssey = makeConferenceRoom(520, 160, 220, 180, 'Odyssey (10p)', 10)
  els.push(odyssey)
  els.push(makeConferenceTable(520, 160, 160, 100, 8))
  // Atlas (820, 160) 200x180 with table at exact center (820, 160).
  const atlas = makeConferenceRoom(820, 160, 200, 180, 'Atlas (6p)', 6)
  els.push(atlas)
  els.push(makeConferenceTable(820, 160, 140, 90, 6))

  // Phone booths flanking the conference rooms. 4 booths × 60x60 each.
  els.push(makePhoneBooth(370, 130, 'Booth 1'))
  els.push(makePhoneBooth(370, 200, 'Booth 2'))
  els.push(makePhoneBooth(970, 130, 'Booth 3'))
  els.push(makePhoneBooth(970, 200, 'Booth 4'))

  // Private offices along the west edge (south of reception). Each is
  // 160x110 with center x=110 → AABB x∈[30..190]. The west wall is at x∈[0..8]
  // so AABB x1=30 leaves a comfortable 22px gap from the wall stroke.
  const privateOffices: PrivateOfficeElement[] = [
    makePrivateOffice(110, 320, 160, 110, 'G-P01', 'Operations office', {
      equipment: ['monitor'],
    }),
    makePrivateOffice(110, 450, 160, 110, 'G-P02', 'People office', {
      equipment: ['monitor'],
    }),
    makePrivateOffice(110, 580, 160, 110, 'G-P03', 'Marketing office'),
    makePrivateOffice(110, 710, 160, 80, 'G-P04', 'Finance partner'),
  ]
  for (const po of privateOffices) {
    els.push(po)
    seatIds.push(po.id)
  }

  // Workstation bench (hot-desk row) in the middle of the bullpen.
  // Center (560, 460), 432x54 → AABB [344..776, 433..487].
  const bench = makeWorkstation(560, 460, 'G-W01', 6, {
    equipment: ['monitor', 'docking-station'],
    width: 6 * 72,
    height: 54,
  })
  els.push(bench)
  seatIds.push(bench.id)

  // Kitchen + lounge common area in the south-east — placed FIRST so the
  // 6 south desks can live inside its AABB. Center (760, 600), 700x340 →
  // AABB [410..1110, 430..770]. The south desks (centers at x∈[440..616],
  // y∈[620..700]) sit fully inside this common area, satisfying the
  // "every desk inside some zone" invariant.
  els.push(makeCommonArea(760, 600, 700, 340, 'Kitchen / Lounge'))
  els.push(makeSofa(900, 480, 180, 60))
  els.push(makeSofa(1020, 660, 160, 60))
  els.push(makePlant(1080, 480))
  els.push(makePlant(1080, 720))

  // 6 desks in two 3-desk rows in the south bullpen. Centers chosen so
  // every desk AABB (72x48) sits inside the kitchen/lounge common area.
  let deskCounter = 1
  const southRows: Array<[number, number]> = []
  for (let col = 0; col < 3; col++) {
    southRows.push([440 + col * 88, 620])
    southRows.push([440 + col * 88, 700])
  }
  for (const [x, y] of southRows) {
    const d = makeDesk(x, y, `G-D${String(deskCounter).padStart(2, '0')}`)
    deskCounter += 1
    els.push(d)
    seatIds.push(d.id)
  }

  const floor: Floor = {
    id: floorId,
    name: '1. Ground floor',
    order: 0,
    elements: Object.fromEntries(els.map((e) => [e.id, e])),
  }

  // Ground floor annotations — point at the conference rooms + reception
  // so a first-time user immediately sees how notes land on the canvas.
  const annotations: Annotation[] = [
    {
      id: nanoid(),
      body: 'Click any desk or office to see its assignee card — drag from the roster to reassign.',
      authorName: 'Floorcraft team',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      anchor: { type: 'floor-position', floorId, x: 120, y: 150 },
    },
    {
      id: nanoid(),
      body: 'Doors snap to walls as you drag them. Try the "Door" tool in the library.',
      authorName: 'Floorcraft team',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      anchor: { type: 'element', elementId: bench.id },
    },
  ]

  return { floor, neighborhoods: [], annotations, seatIds }
}

/**
 * Engineering loft — the bulk of the office. Four neighborhoods tile the
 * main floor plate, one per sub-squad; each has 6 desks arranged in two
 * rows so the clusters read as cohesive pods. A small workstation bench
 * and a conference room sit on the east side for standups.
 *
 * Squad neighborhoods are sized 440x240 (not 400x220) so that 6 desks
 * laid out at offsets [-180, -60, 60] × [-90, 0] from the squad center
 * each fit FULLY inside the neighborhood AABB. Previously the desks at
 * row 0 (y=cy-90) had AABB y1=cy-114 which escaped the cy-110 neighborhood
 * top edge by 4px — visually subtle but enough to fail an "every desk
 * inside its squad" geometric invariant.
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │ Frontend (260,220)        Backend (760,220)      │
 *   │   6 desks 3x2               6 desks 3x2          │
 *   ├───────────── standup bench (560,370) ────────────┤
 *   │ DevOps (260,540)          Platform (760,540)     │
 *   │   6 desks 3x2               6 desks 3x2          │
 *   │              [Huddle (1080,640)]                 │
 *   └──────────────────────────────────────────────────┘
 */
function buildEngineeringFloor(): FloorBuild {
  const els: CanvasElement[] = []
  const seatIds: string[] = []
  const floorId = nanoid()

  // Perimeter — an angled NW corner + a curved SE corner so the demo
  // exercises both the `points` polyline and the `bulges` curved-segment
  // feature. A perfect rectangle would hide both.
  const topWall = makeWall(
    0,
    0,
    [0, 0, 100, 40, 1200, 40],
    'North wall',
  )
  const rightWall = makeWall(
    1192,
    40,
    [0, 0, 0, 700, -80, 760],
    'East wall',
    // Single curved segment at the bottom-right — subtle bulge so the
    // corner reads as "rounded" rather than a hard angle.
    { bulges: [0, -30] },
  )
  const bottomWall = makeWall(0, 760, [0, 0, 1112, 40], 'South wall')
  const leftWall = makeWall(0, 0, [0, 0, 0, 760], 'West wall')
  els.push(topWall, rightWall, bottomWall, leftWall)

  // Stairwell door on the west wall — the mental model is "stairs land in
  // the middle of the west side of every upper floor".
  els.push(makeDoor(-4, 380, leftWall.id, 0.5, 'Stairwell'))
  // Two windows on the east wall.
  els.push(
    makeWindow(1188, 180, rightWall.id, 0.2, 100, 'Window'),
    makeWindow(1188, 500, rightWall.id, 0.6, 100, 'Window'),
  )

  // Neighborhood layout — 2x2 grid, each ~ 400x300.
  // Each neighborhood gets 6 desks in a 3x2 configuration. We keep the
  // desks INSIDE the neighborhood rect so the 15%-alpha tint paints under
  // the desk visuals cleanly.
  const squads: Array<{
    name: keyof typeof ENG_SQUAD_COLORS
    cx: number
    cy: number
    prefix: string
  }> = [
    { name: 'Frontend squad', cx: 260, cy: 220, prefix: 'E-FE' },
    { name: 'Backend core', cx: 760, cy: 220, prefix: 'E-BE' },
    { name: 'DevOps/SRE', cx: 260, cy: 540, prefix: 'E-DO' },
    { name: 'Platform', cx: 760, cy: 540, prefix: 'E-PL' },
  ]

  const neighborhoods: Neighborhood[] = []
  for (const sq of squads) {
    // 440x240 — the previous 400x220 was 4px too tight on each axis to
    // fully contain the 3x2 desk grid laid out at the offsets below.
    const n: Neighborhood = {
      id: nanoid(),
      name: sq.name,
      color: ENG_SQUAD_COLORS[sq.name],
      x: sq.cx,
      y: sq.cy,
      width: 440,
      height: 240,
      floorId,
      department: 'Engineering',
      team: sq.name,
      notes: null,
    }
    neighborhoods.push(n)

    // 6 desks arranged in a 3x2 grid within the neighborhood AABB.
    // Center offsets from (cx, cy):
    //   columns: -180, -60, +60   (so desk AABB x1 ranges from cx-216
    //                              which is > cx-220, fitting inside)
    //   rows:    -60, +60         (desk AABB y1=cy-84, y2=cy+84; both
    //                              inside [cy-120, cy+120])
    let deskNum = 1
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const x = sq.cx - 180 + col * 120
        const y = sq.cy - 60 + row * 120
        const equipment: string[] = ['monitor']
        // One standing desk per squad so the equipment-needs overlay has
        // something to line up with the `standing-desk` accommodation
        // below.
        if (deskNum === 3) equipment.push('standing-desk')
        const d = makeDesk(x, y, `${sq.prefix}${String(deskNum).padStart(2, '0')}`, {
          equipment,
          label: `${sq.name} ${deskNum}`,
        })
        deskNum += 1
        els.push(d)
        seatIds.push(d.id)
      }
    }
  }

  // Central standup area — a long workstation bench between the two
  // neighborhood rows. Center (560, 380), width 4*72=288, height 48 →
  // AABB [416..704, 356..404]. Sits in the gap between the upper squads
  // (y∈[100..340]) and lower squads (y∈[420..660]).
  const standupBench = makeWorkstation(560, 380, 'E-W01', 4, {
    equipment: ['docking-station'],
    width: 4 * 72,
  })
  els.push(standupBench)
  seatIds.push(standupBench.id)

  // Small conference room in the south-east corner for standups.
  // Center (1080, 640), 160x120 → AABB [1000..1160, 580..700].
  // Conference table centered EXACTLY at (1080, 640), 120x70 →
  // AABB [1020..1140, 605..675] — fully inside the room.
  els.push(makeConferenceRoom(1080, 640, 160, 120, 'Huddle (4p)', 4))
  els.push(makeConferenceTable(1080, 640, 120, 70, 4))

  // Plants + sofas in the corners — ambient decoration so the floor
  // doesn't read as a desk parking lot. Plants are 40x40 so center (60,60)
  // gives AABB [40..80, 40..80] — comfortably inside the perimeter wall
  // (which sits at x∈[0..8]).
  els.push(makeSofa(560, 720, 160, 54))
  els.push(makePlant(60, 60))
  els.push(makePlant(1140, 60))
  els.push(makePlant(60, 720))

  const floor: Floor = {
    id: floorId,
    name: '2. Engineering loft',
    order: 1,
    elements: Object.fromEntries(els.map((e) => [e.id, e])),
  }

  const firstNeighborhoodId = neighborhoods[0]?.id
  const annotations: Annotation[] = firstNeighborhoodId
    ? [
        {
          id: nanoid(),
          body: 'Neighborhoods group seats by team. Drag the rect to move a whole squad; the desk tints update automatically.',
          authorName: 'Floorcraft team',
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          anchor: { type: 'floor-position', floorId, x: 260, y: 80 },
        },
        {
          id: nanoid(),
          body: 'The standing-desk badge here is driven by the occupant\'s "standing-desk" accommodation — swap to show the accommodation glyph.',
          authorName: 'Floorcraft team',
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          anchor: { type: 'element', elementId: standupBench.id },
        },
      ]
    : []

  return { floor, neighborhoods, annotations, seatIds }
}

/**
 * Leadership & Design floor — the smallest and most private. Mostly
 * private offices along the perimeter with a collaborative design pod in
 * the middle. Fewer people, bigger rooms.
 *
 * Layout (canvas 1200x800, all coordinates CENTER-ORIGIN):
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │ booths   booths             [Exec lounge NE]     │
 *   │                                                   │
 *   │            [Design pod (600, 300)]               │
 *   │             8 desks + central table               │
 *   │                                                   │
 *   │ [CEO] [CFO] [CPO] [VP Design]   south offices    │
 *   └──────────────────────────────────────────────────┘
 *
 * Critical fix vs. previous version:
 *  - The old code passed `(podCenter[0]-200, podCenter[1]-100, 400, 200)`
 *    to `makeCommonArea`, intending to anchor the top-left at (400, 200) —
 *    but makeCommonArea takes CENTER coords, so the area landed at AABB
 *    [200..600, 100..300] while desks were placed RELATIVE to (600, 300),
 *    extending to x=690, y=360 — entirely outside the pod common area.
 *  - The new code centers the design pod at (600, 300) with size 480x260,
 *    AABB [360..840, 170..430], and positions the 8 desks at offsets
 *    that keep each desk AABB fully inside the pod.
 */
function buildLeadershipFloor(): FloorBuild {
  const els: CanvasElement[] = []
  const seatIds: string[] = []
  const floorId = nanoid()

  // Perimeter — straightforward rectangle with a rounded NE corner via a
  // bulge on the north wall.
  const topWall = makeWall(
    0,
    0,
    [0, 0, 1000, 0, 1200, 80],
    'North wall',
    { bulges: [0, 40] },
  )
  const rightWall = makeWall(1192, 80, [0, 0, 0, 720], 'East wall')
  const bottomWall = makeWall(0, 800, [0, 0, 1200, 0], 'South wall')
  const leftWall = makeWall(0, 0, [0, 0, 0, 800], 'West wall')
  els.push(topWall, rightWall, bottomWall, leftWall)

  // Stairwell door on west — center x=4 keeps the door inside [0,8].
  els.push(makeDoor(4, 400, leftWall.id, 0.5, 'Stairwell'))
  // East-facing windows.
  els.push(
    makeWindow(1188, 200, rightWall.id, 0.17, 120, 'Window'),
    makeWindow(1188, 560, rightWall.id, 0.67, 120, 'Window'),
  )

  // Four private offices along the south wall for VPs / leadership.
  // Each is 180x140 with center y=690 → AABB y∈[620..760], comfortably
  // inside the 800-tall canvas. Centers spaced 220 apart on x.
  const southOffices: Array<[number, number, string]> = [
    [150, 690, 'CEO office'],
    [370, 690, 'CFO office'],
    [590, 690, 'CPO office'],
    [810, 690, 'VP Design'],
  ]
  let priv = 1
  for (const [x, y, label] of southOffices) {
    const po = makePrivateOffice(x, y, 180, 140, `L-P${String(priv).padStart(2, '0')}`, label, {
      equipment: ['monitor', 'docking-station'],
    })
    priv += 1
    els.push(po)
    seatIds.push(po.id)
  }

  // Design pod in the middle — 8 desks ringing a shared central table.
  // Common area center (600, 300), size 480x260 → AABB [360..840, 170..430].
  const podCenter: [number, number] = [600, 300]
  els.push(makeCommonArea(podCenter[0], podCenter[1], 480, 260, 'Design pod'))
  // Conference table centered EXACTLY at the pod center, 180x80 →
  // table AABB [510..690, 260..340], well inside the pod.
  els.push(makeConferenceTable(podCenter[0], podCenter[1], 180, 80, 8))

  // 8 desks in two rows of 4, ringing the central table. Desk size 72x48,
  // so a desk centered at (cx + dx, cy + dy) has AABB extending ±36 in x
  // and ±24 in y. With pod AABB [360..840, 170..430]:
  //   row dy = -90  → desk AABB y∈[cy-114..cy-66] = [186..234]  — inside [170..430]
  //   row dy = +90  → desk AABB y∈[cy+66..cy+114] = [366..414]  — inside [170..430]
  //   columns dx = -180, -60, 60, 180 → x∈[420..816] desk centers,
  //     AABB ranges [384..816] worst-case, all inside [360..840].
  const podDeskOffsets: Array<[number, number]> = [
    [-180, -90],
    [-60, -90],
    [60, -90],
    [180, -90],
    [-180, 90],
    [-60, 90],
    [60, 90],
    [180, 90],
  ]
  let deskIdx = 1
  for (const [dx, dy] of podDeskOffsets) {
    const [cx, cy] = offsetInside(podCenter[0], podCenter[1], dx, dy)
    const d = makeDesk(
      cx,
      cy,
      `L-D${String(deskIdx).padStart(2, '0')}`,
      { label: `Design ${deskIdx}`, equipment: deskIdx === 1 ? ['monitor', 'tablet'] : ['monitor'] },
    )
    deskIdx += 1
    els.push(d)
    seatIds.push(d.id)
  }

  // Phone booths along the north wall, well inside the floor (booth size
  // 60x60 so center y=100 keeps AABB y1=70 inside the 80-tall north-wall
  // bulge area).
  els.push(makePhoneBooth(200, 100, 'Booth 1'))
  els.push(makePhoneBooth(400, 100, 'Booth 2'))
  els.push(makePhoneBooth(900, 100, 'Booth 3'))

  // Executive lounge in the NE corner. Center (1060, 180), 240x140 →
  // AABB [940..1180, 110..250]. Sofa center (1060, 200), 180x60 →
  // AABB [970..1150, 170..230] — fully inside the lounge.
  els.push(makeCommonArea(1060, 180, 240, 140, 'Executive lounge'))
  els.push(makeSofa(1060, 200, 180, 60))
  els.push(makePlant(1140, 230))
  // Decor plants near the perimeter — centered well inside the wall stroke.
  els.push(makePlant(60, 200))
  els.push(makePlant(60, 540))

  const floor: Floor = {
    id: floorId,
    name: '3. Leadership & Design',
    order: 2,
    elements: Object.fromEntries(els.map((e) => [e.id, e])),
  }

  const annotations: Annotation[] = [
    {
      id: nanoid(),
      body: 'Use floor tabs at the bottom to move between the three floors. Each carries its own neighborhoods and annotations.',
      authorName: 'Floorcraft team',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      anchor: { type: 'floor-position', floorId, x: 600, y: 420 },
    },
  ]

  return { floor, neighborhoods: [], annotations, seatIds }
}

// ---------------------------------------------------------------------------
// Employee generation. The ~45 employees are defined as static seed rows so
// the demo feels intentional (real-sounding names, consistent department
// mapping) rather than randomised. `seatIndex` points into the aggregated
// seatIds list the floor builders produce, left → right / floor-1 → floor-3.
//
// A deliberate ~30% of rows are unassigned (seatIndex === null) so the user
// sees both the "available desk" visual AND the "unassigned people" chip on
// the roster — the onboarding value here is showing that both states exist.
// ---------------------------------------------------------------------------

interface EmployeeSeed {
  name: string
  email: string
  department: Department
  title: string
  employmentType: Employee['employmentType']
  status: Employee['status']
  officeDays: string[]
  startDate: string | null
  endDate: string | null
  equipmentNeeds: string[]
  equipmentStatus: Employee['equipmentStatus']
  /** null = unassigned (roster only, no desk). */
  seatIndex: number | null
  accommodations?: Accommodation['type'][]
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const HYBRID = ['Tue', 'Wed', 'Thu']
const MWF = ['Mon', 'Wed', 'Fri']

/**
 * Build the ISO for "now - N days" so the "Ending soon" stat chip lights up
 * regardless of when the demo is loaded.
 */
function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Seat indices below are 1-based for readability and mapped to the
// concatenated seat list below. `null` = unseated (shows up in the roster
// sidebar as "unassigned").
const EMPLOYEE_SEEDS: EmployeeSeed[] = [
  // --- Ground floor people (indices 0..N-1 on ground floor's seatIds) ---
  // Private offices on the ground floor (0..3 = G-P01..G-P04)
  {
    name: 'Priya Shah',
    email: 'priya.shah@demo.co',
    department: 'Operations',
    title: 'Head of Operations',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2019-09-30',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 0,
  },
  {
    name: 'Daria Okafor',
    email: 'daria.okafor@demo.co',
    department: 'People',
    title: 'Head of People',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2020-02-17',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 1,
  },
  {
    name: 'Marta Ribeiro',
    email: 'marta.ribeiro@demo.co',
    department: 'Marketing',
    title: 'Director, Marketing',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2021-05-03',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 2,
  },
  {
    name: 'Theo Nakamura',
    email: 'theo.nakamura@demo.co',
    department: 'Finance',
    title: 'FP&A Partner',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2022-08-15',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 3,
  },
  // Workstation bench (index 4) — shared hot-desk, unassigned so it reads
  // as a bookable slot on the floor.
  // Ground floor desks G-D01..G-D06 (indices 5..10)
  {
    name: 'Nora Abiola',
    email: 'nora.abiola@demo.co',
    department: 'People',
    title: 'People Partner',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2022-01-10',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 5,
    accommodations: ['wheelchair-access'],
  },
  {
    name: 'Miguel Castillo',
    email: 'miguel.castillo@demo.co',
    department: 'Marketing',
    title: 'Brand Designer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2023-06-12',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 6,
  },
  {
    name: 'Aisha Yusuf',
    email: 'aisha.yusuf@demo.co',
    department: 'Operations',
    title: 'Office Coordinator',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2023-09-04',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 7,
  },
  {
    name: 'Ravi Krishnan',
    email: 'ravi.krishnan@demo.co',
    department: 'Finance',
    title: 'Senior Accountant',
    employmentType: 'full-time',
    status: 'active',
    officeDays: MWF,
    startDate: '2021-11-29',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'pending',
    seatIndex: 8,
  },
  {
    name: 'Jamie Walker',
    email: 'jamie.walker@demo.co',
    department: 'Marketing',
    title: 'Content Strategist',
    employmentType: 'full-time',
    status: 'on-leave',
    officeDays: HYBRID,
    startDate: '2021-03-08',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 9,
  },
  {
    name: 'Felix Ng',
    email: 'felix.ng@demo.co',
    department: 'Operations',
    title: 'IT Operations Lead',
    employmentType: 'contractor',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2024-07-19',
    endDate: isoDaysFromNow(25),
    equipmentNeeds: ['laptop', 'headset'],
    equipmentStatus: 'pending',
    seatIndex: 10,
  },

  // --- Engineering loft (25 seats: 24 neighborhood desks + 1 standup bench) ---
  // Frontend squad (6 desks, indices 11..16)
  {
    name: 'Mia Chen',
    email: 'mia.chen@demo.co',
    department: 'Engineering',
    title: 'Engineering Manager, Frontend',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2020-06-14',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 11,
  },
  {
    name: 'Alice Kim',
    email: 'alice.kim@demo.co',
    department: 'Engineering',
    title: 'Senior Frontend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: MWF,
    startDate: '2022-03-01',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 12,
  },
  {
    name: 'Danielle Park',
    email: 'danielle.park@demo.co',
    department: 'Engineering',
    title: 'Frontend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2023-10-03',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor', 'standing-desk'],
    equipmentStatus: 'provisioned',
    seatIndex: 13,
    accommodations: ['standing-desk'],
  },
  {
    name: 'Louis Beaumont',
    email: 'louis.beaumont@demo.co',
    department: 'Engineering',
    title: 'Staff Frontend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2019-01-12',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 14,
  },
  {
    name: 'Emma Lindqvist',
    email: 'emma.lindqvist@demo.co',
    department: 'Engineering',
    title: 'Frontend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2024-01-22',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 15,
  },
  {
    name: 'Hassan Demir',
    email: 'hassan.demir@demo.co',
    department: 'Engineering',
    title: 'Frontend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2023-07-10',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 16,
  },

  // Backend core (indices 17..22)
  {
    name: 'Rahul Mehta',
    email: 'rahul.mehta@demo.co',
    department: 'Engineering',
    title: 'Engineering Manager, Backend',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2019-10-04',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 17,
  },
  {
    name: 'Sofia Moretti',
    email: 'sofia.moretti@demo.co',
    department: 'Engineering',
    title: 'Staff Backend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2020-05-18',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 18,
  },
  {
    name: 'Owen Ferrell',
    email: 'owen.ferrell@demo.co',
    department: 'Engineering',
    title: 'Senior Backend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2022-09-15',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor', 'standing-desk'],
    equipmentStatus: 'provisioned',
    seatIndex: 19,
    accommodations: ['standing-desk'],
  },
  {
    name: 'Chen Wei',
    email: 'chen.wei@demo.co',
    department: 'Engineering',
    title: 'Backend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: MWF,
    startDate: '2024-03-05',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'pending',
    seatIndex: 20,
  },
  {
    name: 'Yuki Watanabe',
    email: 'yuki.watanabe@demo.co',
    department: 'Engineering',
    title: 'Backend Engineer',
    employmentType: 'full-time',
    status: 'on-leave',
    officeDays: HYBRID,
    startDate: '2022-11-21',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 21,
  },
  {
    name: 'Adebayo Olu',
    email: 'adebayo.olu@demo.co',
    department: 'Engineering',
    title: 'Backend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2023-04-11',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 22,
  },

  // DevOps/SRE (indices 23..28)
  {
    name: 'Sana Haidari',
    email: 'sana.haidari@demo.co',
    department: 'Engineering',
    title: 'SRE Manager',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2020-07-01',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 23,
  },
  {
    name: 'Noah Eriksson',
    email: 'noah.eriksson@demo.co',
    department: 'Engineering',
    title: 'Senior SRE',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2021-02-14',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 24,
  },
  {
    name: 'Keiko Yamamoto',
    email: 'keiko.yamamoto@demo.co',
    department: 'Engineering',
    title: 'DevOps Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: MWF,
    startDate: '2024-06-03',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'pending',
    seatIndex: 25,
    accommodations: ['quiet-zone'],
  },
  {
    name: 'Gabriel Silva',
    email: 'gabriel.silva@demo.co',
    department: 'Engineering',
    title: 'DevOps Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2023-01-09',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 26,
  },
  // 27 + 28 left unseated (empty desks in DevOps pod) so the "open seat"
  // visual renders in a realistic pod.

  // Platform (indices 29..34)
  {
    name: 'Ivan Petrov',
    email: 'ivan.petrov@demo.co',
    department: 'Engineering',
    title: 'Platform Lead',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2019-12-02',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 29,
  },
  {
    name: 'Harini Raj',
    email: 'harini.raj@demo.co',
    department: 'Engineering',
    title: 'Senior Platform Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2021-09-20',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 30,
  },
  {
    name: 'Kai Wilson',
    email: 'kai.wilson@demo.co',
    department: 'Engineering',
    title: 'Platform Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2023-08-14',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 31,
  },
  {
    name: 'Lena Hoffmann',
    email: 'lena.hoffmann@demo.co',
    department: 'Engineering',
    title: 'Platform Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2024-02-05',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'pending',
    seatIndex: 32,
  },
  // 33, 34 left unseated — Platform pod intentionally has two open desks
  // so the user sees what an "available seat" looks like.

  // Standup bench (index 35) — left unassigned so the bench reads as
  // "shared bookable space".

  // --- Leadership floor (12 seats: 4 exec offices + 8 design pod desks) ---
  {
    name: 'Adrienne Moreau',
    email: 'adrienne.moreau@demo.co',
    department: 'Product',
    title: 'CEO',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2018-04-02',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 36,
  },
  {
    name: 'Bernard Huang',
    email: 'bernard.huang@demo.co',
    department: 'Finance',
    title: 'CFO',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2019-01-15',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 37,
  },
  {
    name: 'Vera Sokolova',
    email: 'vera.sokolova@demo.co',
    department: 'Product',
    title: 'Chief Product Officer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2019-08-19',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 38,
  },
  {
    name: 'Kenji Tanaka',
    email: 'kenji.tanaka@demo.co',
    department: 'Design',
    title: 'VP Design',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2020-01-13',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor', 'tablet'],
    equipmentStatus: 'provisioned',
    seatIndex: 39,
  },
  // Design pod desks (indices 40..47)
  {
    name: 'Ivy Ross',
    email: 'ivy.ross@demo.co',
    department: 'Design',
    title: 'Staff Product Designer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2021-03-01',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor', 'tablet'],
    equipmentStatus: 'provisioned',
    seatIndex: 40,
    accommodations: ['natural-light'],
  },
  {
    name: 'Rohan Kapoor',
    email: 'rohan.kapoor@demo.co',
    department: 'Design',
    title: 'Senior Product Designer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2022-07-18',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 41,
  },
  {
    name: 'Luna Vasquez',
    email: 'luna.vasquez@demo.co',
    department: 'Design',
    title: 'Design Intern',
    employmentType: 'intern',
    status: 'active',
    officeDays: ['Tue', 'Thu'],
    startDate: '2026-01-27',
    endDate: isoDaysFromNow(45),
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: 42,
  },
  {
    name: 'Beatrice Thompson',
    email: 'beatrice.thompson@demo.co',
    department: 'Product',
    title: 'Senior Product Manager',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2021-11-04',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 43,
  },
  {
    name: 'Jamal Williams',
    email: 'jamal.williams@demo.co',
    department: 'Product',
    title: 'Product Manager',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2023-02-09',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: 44,
  },
  {
    name: 'Celia Navarro',
    email: 'celia.navarro@demo.co',
    department: 'Product',
    title: 'Product Manager',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2024-05-20',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'pending',
    seatIndex: 45,
  },
  // Design pod seats 46, 47 left open.

  // --- Unassigned employees — show up in the roster sidebar so the user
  // sees the "unassigned" pile the product is designed to help reduce.
  {
    name: 'Parker Donovan',
    email: 'parker.donovan@demo.co',
    department: 'Engineering',
    title: 'Backend Engineer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: isoDaysFromNow(-7),
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'pending',
    seatIndex: null,
  },
  {
    name: 'Alejandro Ruiz',
    email: 'alejandro.ruiz@demo.co',
    department: 'Design',
    title: 'Product Designer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: isoDaysFromNow(-14),
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor', 'tablet'],
    equipmentStatus: 'pending',
    seatIndex: null,
  },
  {
    name: 'Mei Lin',
    email: 'mei.lin@demo.co',
    department: 'Marketing',
    title: 'Growth Marketer',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: isoDaysFromNow(-3),
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'pending',
    seatIndex: null,
  },
  {
    name: 'Oliver Bennet',
    email: 'oliver.bennet@demo.co',
    department: 'Operations',
    title: 'Operations Analyst',
    employmentType: 'full-time',
    status: 'active',
    officeDays: HYBRID,
    startDate: '2024-11-04',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: null,
  },
  {
    name: 'Fatima Al-Hassan',
    email: 'fatima.alhassan@demo.co',
    department: 'Engineering',
    title: 'Frontend Engineer',
    employmentType: 'contractor',
    status: 'active',
    officeDays: [],
    startDate: '2024-09-12',
    endDate: isoDaysFromNow(60),
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: null,
  },
  {
    name: 'Grace Park',
    email: 'grace.park@demo.co',
    department: 'People',
    title: 'Recruiter',
    employmentType: 'full-time',
    status: 'on-leave',
    officeDays: WEEKDAYS,
    startDate: '2021-08-16',
    endDate: null,
    equipmentNeeds: ['laptop'],
    equipmentStatus: 'provisioned',
    seatIndex: null,
  },
  {
    name: 'Henri Dubois',
    email: 'henri.dubois@demo.co',
    department: 'Finance',
    title: 'Financial Analyst',
    employmentType: 'full-time',
    status: 'active',
    officeDays: WEEKDAYS,
    startDate: '2023-04-24',
    endDate: null,
    equipmentNeeds: ['laptop', 'monitor'],
    equipmentStatus: 'provisioned',
    seatIndex: null,
  },
]

// ---------------------------------------------------------------------------
// Top-level builder.
// ---------------------------------------------------------------------------

/**
 * Assemble a fully-seeded, multi-floor demo office payload — three floors
 * with walls, doors, windows, ~45 employees distributed across Engineering
 * neighborhoods, leadership offices, and ground-floor services, plus a
 * handful of annotations introducing the product's surfaces.
 *
 * Pure: no store writes, no network. The caller persists the returned
 * payload (TeamHomePage.onNewDemo + FirstRunCoach's "Load sample content"
 * both route it through `saveOffice`).
 *
 * The multi-floor upgrade replaces Wave 10's single-floor sampler so the
 * "try demo office" entry point actually showcases the product. Keep the
 * shape aligned with `useOfficeSync.buildCurrentPayload` — any new
 * top-level slot introduced there (annotations, neighborhoods, share
 * links, etc.) should be populated or explicitly omitted here so the
 * round-trip stays clean.
 */
export function buildDemoOfficePayload(): DemoOfficePayload {
  const ground = buildGroundFloor()
  const engineering = buildEngineeringFloor()
  const leadership = buildLeadershipFloor()

  // Concatenate seat id arrays in floor order. The EMPLOYEE_SEEDS
  // `seatIndex` points into this aggregate list. Keep the order stable:
  // ground → engineering → leadership, never sort.
  const allSeats: string[] = [
    ...ground.seatIds,
    ...engineering.seatIds,
    ...leadership.seatIds,
  ]

  // Aggregate elements across all floors into a single working map. This
  // is internal to the build pipeline — it lets the seat-assignment loop
  // below resolve any seat id (regardless of floor) when reflecting the
  // occupant back onto the desk/workstation/private-office element. The
  // returned `payload.elements` is NOT this merged map (see the bottom of
  // this function for why) — that field is contracted to be the ACTIVE
  // floor's elements only.
  const elementsMap: Record<string, CanvasElement> = {
    ...ground.floor.elements,
    ...engineering.floor.elements,
    ...leadership.floor.elements,
  }

  // Build a seat-id → floor-id index so each employee's `floorId` gets
  // backfilled from whichever floor holds their seat. This stays explicit
  // (rather than inferred from a "seats live on the active floor" shortcut)
  // so roster drawers that hide/show people by floor can filter correctly
  // even before the user switches floors.
  const seatToFloor: Record<string, string> = {}
  for (const id of Object.keys(ground.floor.elements)) seatToFloor[id] = ground.floor.id
  for (const id of Object.keys(engineering.floor.elements)) seatToFloor[id] = engineering.floor.id
  for (const id of Object.keys(leadership.floor.elements)) seatToFloor[id] = leadership.floor.id

  const now = new Date().toISOString()
  const employees: Record<string, Employee> = {}
  for (const seed of EMPLOYEE_SEEDS) {
    const id = nanoid()
    const seatId =
      seed.seatIndex !== null && seed.seatIndex < allSeats.length
        ? allSeats[seed.seatIndex]
        : null
    const floorId = seatId ? seatToFloor[seatId] ?? null : null

    const accommodations: Accommodation[] = (seed.accommodations ?? []).map((type) => ({
      id: nanoid(),
      type,
      notes: null,
      createdAt: now,
    }))

    const employee: Employee = {
      id,
      name: seed.name,
      email: seed.email,
      department: seed.department,
      team: null,
      title: seed.title,
      managerId: null,
      employmentType: seed.employmentType,
      status: seed.status,
      officeDays: [...seed.officeDays],
      startDate: seed.startDate,
      endDate: seed.endDate,
      equipmentNeeds: [...seed.equipmentNeeds],
      equipmentStatus: seed.equipmentStatus,
      photoUrl: null,
      tags: [],
      accommodations,
      sensitivityTags: [],
      seatId,
      floorId,
      leaveType: null,
      expectedReturnDate: null,
      coverageEmployeeId: null,
      leaveNotes: null,
      departureDate: null,
      pendingStatusChanges: [],
      createdAt: now,
    }
    employees[id] = employee
  }

  // Reflect assignments back onto the desk/workstation/private-office
  // elements so the canvas shows the occupant at first render rather than
  // flashing an empty desk. Workstations and private offices accept
  // multiple occupants (`assignedEmployeeIds`) while 1:1 desks carry a
  // single `assignedEmployeeId` — we branch on the element discriminant.
  for (const emp of Object.values(employees)) {
    if (!emp.seatId) continue
    const el = elementsMap[emp.seatId]
    if (!el) continue
    if (el.type === 'desk' || el.type === 'hot-desk') {
      elementsMap[emp.seatId] = { ...(el as DeskElement), assignedEmployeeId: emp.id }
    } else if (isWorkstationElement(el)) {
      // Workstation `assignedEmployeeIds` is a sparse positional array;
      // place this employee in the first empty slot. If the array is
      // somehow already full, fall through silently — the seat
      // assignment loop above is best-effort for the seed.
      const next = [...el.assignedEmployeeIds]
      const slot = next.findIndex((id) => id === null)
      if (slot !== -1) {
        next[slot] = emp.id
        elementsMap[emp.seatId] = { ...el, assignedEmployeeIds: next }
      }
    } else if (isPrivateOfficeElement(el)) {
      elementsMap[emp.seatId] = {
        ...el,
        assignedEmployeeIds: [...el.assignedEmployeeIds, emp.id],
      }
    }
  }

  // Mirror the updated element map back onto each floor so the per-floor
  // `elements` record matches the top-level map. `loadFromLegacyPayload`
  // reads both via `ProjectShell` — any divergence would cause the
  // employee-name label on a desk to flicker to empty after a floor
  // switch.
  const floors: Floor[] = [
    {
      ...ground.floor,
      elements: Object.fromEntries(
        Object.keys(ground.floor.elements).map((id) => [id, elementsMap[id]]),
      ),
    },
    {
      ...engineering.floor,
      elements: Object.fromEntries(
        Object.keys(engineering.floor.elements).map((id) => [id, elementsMap[id]]),
      ),
    },
    {
      ...leadership.floor,
      elements: Object.fromEntries(
        Object.keys(leadership.floor.elements).map((id) => [id, elementsMap[id]]),
      ),
    },
  ]

  const neighborhoods: Record<string, Neighborhood> = {}
  for (const n of [
    ...ground.neighborhoods,
    ...engineering.neighborhoods,
    ...leadership.neighborhoods,
  ]) {
    neighborhoods[n.id] = n
  }

  const annotations: Record<string, Annotation> = {}
  for (const a of [
    ...ground.annotations,
    ...engineering.annotations,
    ...leadership.annotations,
  ]) {
    annotations[a.id] = a
  }

  // CRITICAL: `payload.elements` carries ONLY the active floor's
  // elements. The other floors' elements live in `floors[i].elements`.
  // This mirrors the live-app contract enforced by `ProjectShell` and
  // `switchToFloor`: the elements store always represents whichever
  // floor is currently active; floor switches save the live elements
  // into the outgoing floor's snapshot and load the new floor's
  // snapshot back. If we returned a flat merged map here, every floor's
  // walls / desks / decor would render on top of each other on whichever
  // floor the user lands on — and the first floor switch would corrupt
  // the snapshot by writing the merged superset over the outgoing
  // floor's `elements`. The post-build assignment loop above already
  // mirrored the per-element occupant updates back to each floor's
  // `elements`, so picking the engineering floor's elements here gives
  // us a fully-populated active-floor view with the same occupants that
  // the per-floor snapshots will use after a switch.
  const activeFloor = floors.find((f) => f.id === engineering.floor.id) ?? floors[0]

  return {
    version: 2,
    elements: { ...activeFloor.elements },
    employees,
    departmentColors: { ...DEPARTMENTS },
    floors,
    activeFloorId: activeFloor.id, // open on the dense engineering floor —
    // that's where neighborhoods + accommodations + density all show up
    // at once; first impression > ceremony.
    settings: { ...DEFAULT_CANVAS_SETTINGS },
    neighborhoods,
    annotations,
  }
}
