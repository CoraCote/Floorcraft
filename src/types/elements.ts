export type ElementType =
  | 'wall'
  | 'room'
  | 'door'
  | 'window'
  | 'table-round'
  | 'table-rect'
  | 'table-banquet'
  | 'table-conference'
  | 'chair'
  | 'sofa'
  | 'desk'
  | 'counter'
  | 'stage'
  | 'bar'
  | 'reception'
  | 'dance-floor'
  | 'custom-shape'
  | 'text-label'
  | 'background-image'
  | 'divider'
  | 'planter'
  | 'stool'
  | 'podium'
  | 'lectern'

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
  style: ElementStyle
}

export interface WallElement extends BaseElement {
  type: 'wall'
  points: number[]
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

export type TableType = 'table-round' | 'table-rect' | 'table-banquet' | 'table-conference'

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

export type CanvasElement =
  | WallElement
  | DoorElement
  | WindowElement
  | TableElement
  | BackgroundImageElement
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
    el.type === 'table-round' ||
    el.type === 'table-rect' ||
    el.type === 'table-banquet' ||
    el.type === 'table-conference'
  )
}

export function isBackgroundImageElement(el: CanvasElement): el is BackgroundImageElement {
  return el.type === 'background-image'
}
