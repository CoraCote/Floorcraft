import type { SeatStatus } from './seatAssignment'

export type ElementType =
  | 'wall'
  | 'door'
  | 'window'
  | 'desk'
  | 'hot-desk'
  | 'workstation'
  | 'private-office'
  | 'conference-room'
  | 'phone-booth'
  | 'common-area'
  | 'chair'
  | 'counter'
  | 'table-rect'
  | 'table-conference'
  | 'table-round'       // NEW
  | 'table-oval'        // NEW
  | 'divider'
  | 'planter'
  | 'custom-shape'
  | 'text-label'
  | 'background-image'
  | 'decor'             // NEW
  // Drawing primitives (Feature A)
  | 'rect-shape'
  | 'ellipse'
  | 'line-shape'
  | 'arrow'
  | 'free-text'
  // Custom SVG upload (Feature F)
  | 'custom-svg'

export interface ElementStyle {
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
}

export interface BaseElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  locked: boolean
  groupId: string | null
  zIndex: number
  label: string
  visible: boolean
  zone?: string
  style: ElementStyle
}

/**
 * Semantic classification of a wall — independent of its visual stroke
 * style (`dashStyle`). Used for space-planning reports, export legends, and
 * per-type visual treatments in `WallRenderer` (opacity, color, marker).
 *
 *   - `solid`       drywall; the default for any legacy or untagged wall.
 *   - `glass`       glass partition (renders lighter + translucent).
 *   - `half-height` pony wall / cubicle divider (< 4ft) — rendered with a
 *                   secondary dashed rail to signal "short wall".
 *   - `demountable` modular/reconfigurable wall — rendered with a dashed
 *                   stroke + an "M" midpoint marker.
 *
 * `WallDrawStyle` (solid/dashed/dotted) is orthogonal: a wall can be both
 * `glass` + `dashed`. The type controls semantics; dashStyle controls the
 * line-pattern overlay.
 */
export const WALL_TYPES = ['solid', 'glass', 'half-height', 'demountable'] as const
export type WallType = (typeof WALL_TYPES)[number]

export interface WallElement extends BaseElement {
  type: 'wall'
  points: number[]
  /**
   * Optional per-segment arc bulges. Length === (points.length / 2) - 1.
   * bulges[i] is the signed perpendicular offset, in world units, from the
   * midpoint of the chord (points[i*2..i*2+3]) to the midpoint of the arc.
   * Positive = bulge to the LEFT of the chord direction (start → end).
   * 0 (or missing/undefined array) = straight segment.
   */
  bulges?: number[]
  thickness: number
  connectedWallIds: string[]
  /**
   * Optional stroke pattern. Undefined or 'solid' = no dashes. The renderer
   * maps 'dashed' → [thickness*2.5, thickness*1.5] and 'dotted' → short
   * dashes with a round line cap so they render as dots.
   */
  dashStyle?: 'solid' | 'dashed' | 'dotted'
  /**
   * Semantic wall classification. See `WallType` for the full enum.
   * Construction sites must default to `'solid'`; legacy autosave payloads
   * are back-filled to `'solid'` in `loadFromLegacyPayload.migrateElements`.
   */
  wallType: WallType
}

export interface DoorElement extends BaseElement {
  type: 'door'
  parentWallId: string
  positionOnWall: number
  swingDirection: 'left' | 'right' | 'both'
  openAngle: number
}

export interface WindowElement extends BaseElement {
  type: 'window'
  parentWallId: string
  positionOnWall: number
}

export interface SeatPosition {
  id: string
  offsetX: number
  offsetY: number
  rotation: number
  assignedGuestId: string | null
}

export type TableType = 'table-rect' | 'table-conference' | 'table-round' | 'table-oval'

export interface TableElement extends BaseElement {
  type: TableType
  seatCount: number
  seatLayout: 'around' | 'one-side' | 'both-sides' | 'u-shape'
  seats: SeatPosition[]
}

export interface BackgroundImageElement extends BaseElement {
  type: 'background-image'
  storageUrl: string
  originalWidth: number
  originalHeight: number
}

// Assignable elements (have seats for employees)
export interface DeskElement extends BaseElement {
  type: 'desk' | 'hot-desk'
  shape?: 'straight' | 'l-shape' | 'cubicle'   // optional; undefined === 'straight'
  deskId: string           // e.g., "D-101"
  assignedEmployeeId: string | null
  capacity: 1
  /**
   * Optional override layered on top of the derived status. When absent
   * the seat's status is `assigned` (if someone is on it) or `unassigned`.
   * See `deriveSeatStatus` in `src/lib/seatStatus.ts`.
   */
  seatStatus?: SeatStatus
}

export interface WorkstationElement extends BaseElement {
  type: 'workstation'
  deskId: string
  positions: number        // how many positions (N seats)
  assignedEmployeeIds: string[]
  seatStatus?: SeatStatus
}

export interface PrivateOfficeElement extends BaseElement {
  type: 'private-office'
  shape?: 'rectangular' | 'u-shape'   // optional; undefined === 'rectangular'
  deskId: string
  capacity: 1 | 2
  assignedEmployeeIds: string[]
  seatStatus?: SeatStatus
}

// Non-assignable space elements
export interface ConferenceRoomElement extends BaseElement {
  type: 'conference-room'
  roomName: string
  capacity: number
}

export interface PhoneBoothElement extends BaseElement {
  type: 'phone-booth'
}

export interface CommonAreaElement extends BaseElement {
  type: 'common-area'
  areaName: string       // e.g., "Kitchen", "Lounge"
}

export type DecorShape =
  | 'armchair'
  | 'couch'
  | 'reception'
  | 'kitchen-counter'
  | 'fridge'
  | 'whiteboard'
  | 'column'
  | 'stairs'
  | 'elevator'

export interface DecorElement extends BaseElement {
  type: 'decor'
  shape: DecorShape
}

// Drawing primitives ---------------------------------------------------------

export interface RectShapeElement extends BaseElement {
  type: 'rect-shape'
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse'
}

export interface LineShapeElement extends BaseElement {
  type: 'line-shape'
  /** Absolute world coords [x1, y1, x2, y2]. The wrapping Group renders at
   *  (0,0) and the Line reads these directly so edits to x/y don't silently
   *  double-offset. x/y on the base are tracked as the midpoint for hit-tests. */
  points: number[]
  dashStyle?: 'solid' | 'dashed' | 'dotted'
}

export interface ArrowElement extends BaseElement {
  type: 'arrow'
  points: number[]
  dashStyle?: 'solid' | 'dashed' | 'dotted'
}

export interface FreeTextElement extends BaseElement {
  type: 'free-text'
  text: string
  fontSize: number
}

export interface CustomSvgElement extends BaseElement {
  type: 'custom-svg'
  /** Raw sanitized SVG source. Stored inline (no backend) so it survives
   *  autosave. Capped at 50KB at upload time. */
  svgSource: string
}

export type CanvasElement =
  | WallElement
  | DoorElement
  | WindowElement
  | TableElement
  | BackgroundImageElement
  | DeskElement
  | WorkstationElement
  | PrivateOfficeElement
  | ConferenceRoomElement
  | PhoneBoothElement
  | CommonAreaElement
  | DecorElement           // NEW
  | RectShapeElement
  | EllipseElement
  | LineShapeElement
  | ArrowElement
  | FreeTextElement
  | CustomSvgElement
  | BaseElement

export function isWallElement(el: CanvasElement): el is WallElement {
  return el.type === 'wall'
}

export function isDoorElement(el: CanvasElement): el is DoorElement {
  return el.type === 'door'
}

export function isWindowElement(el: CanvasElement): el is WindowElement {
  return el.type === 'window'
}

export function isTableElement(el: CanvasElement): el is TableElement {
  return (
    el.type === 'table-rect' ||
    el.type === 'table-conference' ||
    el.type === 'table-round' ||
    el.type === 'table-oval'
  )
}

export function isBackgroundImageElement(el: CanvasElement): el is BackgroundImageElement {
  return el.type === 'background-image'
}

export function isDeskElement(el: CanvasElement): el is DeskElement {
  return el.type === 'desk' || el.type === 'hot-desk'
}

export function isWorkstationElement(el: CanvasElement): el is WorkstationElement {
  return el.type === 'workstation'
}

export function isPrivateOfficeElement(el: CanvasElement): el is PrivateOfficeElement {
  return el.type === 'private-office'
}

export function isConferenceRoomElement(el: CanvasElement): el is ConferenceRoomElement {
  return el.type === 'conference-room'
}

export function isCommonAreaElement(el: CanvasElement): el is CommonAreaElement {
  return el.type === 'common-area'
}

export function isAssignableElement(el: CanvasElement): el is DeskElement | WorkstationElement | PrivateOfficeElement {
  return el.type === 'desk' || el.type === 'hot-desk' || el.type === 'workstation' || el.type === 'private-office'
}

export function isDecorElement(el: CanvasElement): el is DecorElement {
  return el.type === 'decor'
}

export function isRectShapeElement(el: CanvasElement): el is RectShapeElement {
  return el.type === 'rect-shape'
}

export function isEllipseElement(el: CanvasElement): el is EllipseElement {
  return el.type === 'ellipse'
}

export function isLineShapeElement(el: CanvasElement): el is LineShapeElement {
  return el.type === 'line-shape'
}

export function isArrowElement(el: CanvasElement): el is ArrowElement {
  return el.type === 'arrow'
}

export function isFreeTextElement(el: CanvasElement): el is FreeTextElement {
  return el.type === 'free-text'
}

export function isCustomSvgElement(el: CanvasElement): el is CustomSvgElement {
  return el.type === 'custom-svg'
}
