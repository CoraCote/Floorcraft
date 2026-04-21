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
}

export interface WorkstationElement extends BaseElement {
  type: 'workstation'
  deskId: string
  positions: number        // how many positions (N seats)
  assignedEmployeeIds: string[]
}

export interface PrivateOfficeElement extends BaseElement {
  type: 'private-office'
  shape?: 'rectangular' | 'u-shape'   // optional; undefined === 'rectangular'
  deskId: string
  capacity: 1 | 2
  assignedEmployeeIds: string[]
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
