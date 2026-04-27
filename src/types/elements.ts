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
  // Furniture catalog — non-assignable decorative/context props. Kept as
  // top-level discriminated union members (not `decor` shapes) so the
  // catalog can evolve independent defaults, renderers, and analyzer
  // exclusions without re-homing legacy decor data. See
  // `src/components/editor/Canvas/SofaRenderer.tsx` et al.
  | 'sofa'
  | 'plant'
  | 'printer'
  | 'whiteboard'
  // Drawing primitives (Feature A)
  | 'rect-shape'
  | 'ellipse'
  | 'line-shape'
  | 'arrow'
  | 'free-text'
  // Custom SVG upload (Feature F)
  | 'custom-svg'
  // IT/AV/Network/Power layer (M1) — physical infrastructure props that
  // live on the floor next to seating/decor. Each is non-assignable (no
  // employee, no neighborhood) and contributes to one of four logical
  // sub-layers (network/av/security/power) used by the M2 view-toggle
  // work. Listed individually rather than rolled into a single `device`
  // discriminated union so that future per-type renderers, defaults, and
  // analyzer carve-outs (utilisation, churn) follow the same one-type-→-
  // one-renderer contract the existing furniture catalog established.
  // See `IT_DEVICE_TYPES` and `itLayerOf` below.
  | 'access-point'
  | 'network-jack'
  | 'display'
  | 'video-bar'
  | 'badge-reader'
  | 'outlet'

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
  /**
   * Equipment provisioned at this desk (free-form tag strings such as
   * `"monitor"`, `"standing-desk"`, `"docking-station"`). Compared against
   * the seated employee's `equipmentNeeds` by the equipment-needs overlay
   * (`src/lib/equipmentOverlay.ts`). Legacy payloads are back-filled to
   * `[]` in `migrateElements`; always safe to treat as an array when
   * present, and absent/undefined is equivalent to `[]` (no equipment).
   */
  equipment?: string[]
}

export interface WorkstationElement extends BaseElement {
  type: 'workstation'
  deskId: string
  positions: number        // how many positions (N seats)
  /**
   * Sparse positional array. Length is exactly `positions`; index `i`
   * is the occupant of slot `i`, or `null` when the slot is empty.
   *
   * The sparse shape (vs. a dense `string[]`) lets a user drop someone
   * onto a SPECIFIC slot of a multi-position bench rather than relying
   * on append order — which is what `WorkstationRenderer` already
   * implies visually (it draws one column per slot index). The
   * `loadFromLegacyPayload.migrateElements` migration right-pads
   * older `string[]` payloads with nulls so existing offices keep
   * rendering identically.
   */
  assignedEmployeeIds: Array<string | null>
  seatStatus?: SeatStatus
  /** See `DeskElement.equipment`. */
  equipment?: string[]
}

export interface PrivateOfficeElement extends BaseElement {
  type: 'private-office'
  shape?: 'rectangular' | 'u-shape'   // optional; undefined === 'rectangular'
  deskId: string
  capacity: 1 | 2
  assignedEmployeeIds: string[]
  seatStatus?: SeatStatus
  /** See `DeskElement.equipment`. */
  equipment?: string[]
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

// Furniture catalog — purely visual props. No extra payload beyond the
// BaseElement fields; everything that differs between them (default size,
// silhouette) lives in `ELEMENT_DEFAULTS` and the per-type Konva renderer.
// Keeping the interfaces minimal (rather than folding them into a single
// `FurnitureElement` with a discriminator) preserves the "one element type
// → one renderer" mapping in ElementRenderer's switch.
export interface SofaElement extends BaseElement {
  type: 'sofa'
}

export interface PlantElement extends BaseElement {
  type: 'plant'
}

export interface PrinterElement extends BaseElement {
  type: 'printer'
}

export interface WhiteboardElement extends BaseElement {
  type: 'whiteboard'
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

// ---------------------------------------------------------------------------
// IT/AV/Network/Power layer (M1)
// ---------------------------------------------------------------------------
//
// These six element types represent physical infrastructure that sits on
// the floor alongside seating and decor — wireless access points,
// network jacks, displays, video bars, badge readers, and outlets — and
// form the foundation of the upcoming "IT layer" feature.
//
// Each interface extends `BaseElement` with type-specific attribute
// fields. Every IT-attribute is OPTIONAL on creation: a user can drop
// the element from the library (M2) with nothing but a position, then
// fill in serial numbers, vendors, and operational status in the
// properties panel later. Coercing `null` rather than allowing
// `undefined` keeps the field shape predictable across the round-trip
// through Supabase / autosave (JSON has no `undefined`).
//
// `deviceStatus` is a small finite enum that several element types
// share. Re-declaring the literal union on each interface (rather than
// extracting a `DeviceStatus` alias) keeps each interface self-
// describing for IDE go-to-definition; if M2/M3 grows the enum we can
// hoist it then.
//
// The fields below are intentionally a subset of the full IT-asset
// schema — model / serial / mac / ip / vendor / install date — that
// recur across most device types in real-world office IT inventory.
// Specifics (cable category for jacks, conferencing platform for video
// bars, outlet receptacle type) live on the per-type interface.

/**
 * Wireless access point — a ceiling-mounted Wi-Fi radio. Drawn as a
 * disc on the floor plan because that's the convention in commercial
 * AV/IT drawings (the radio's antenna is omnidirectional, so the
 * silhouette doesn't need to convey orientation).
 */
export interface AccessPointElement extends BaseElement {
  type: 'access-point'
  /** Vendor make + model — e.g. "Cisco Meraki MR46". Optional; renders as
   *  the only label when present. */
  model?: string | null
  /** Serial number. Optional; surfaces in Properties + Devices panel
   *  (M3). */
  serialNumber?: string | null
  /** MAC address (lowercase, colon-separated). Optional. */
  macAddress?: string | null
  /** Static IP if assigned. Optional. */
  ipAddress?: string | null
  /** Vendor / installer / managed-by org. Optional. */
  vendor?: string | null
  /** ISO date the device was installed. Optional. */
  installDate?: string | null
  /** Current operational state — read primarily by future monitoring
   *  integration but a manual override is useful for "we know it's
   *  broken, schedule the fix". */
  deviceStatus?: 'planned' | 'installed' | 'live' | 'decommissioned' | 'broken' | null
}

/**
 * Network jack (RJ45 wall outlet). Tiny by default because real jacks
 * are small physical objects and the floor plan needs to convey their
 * count + location, not their bulk.
 */
export interface NetworkJackElement extends BaseElement {
  type: 'network-jack'
  /** User-facing jack identifier — e.g. "J-101". */
  jackId?: string | null
  /** Cable category. */
  cableCategory?: 'cat5e' | 'cat6' | 'cat6a' | 'cat7' | 'fiber' | null
  /** Upstream switch identifier (free-form for now; M2 will turn this
   *  into an element-id reference). */
  upstreamSwitchLabel?: string | null
  upstreamSwitchPort?: string | null
  serialNumber?: string | null
  installDate?: string | null
  deviceStatus?: 'planned' | 'installed' | 'live' | 'decommissioned' | 'broken' | null
}

/**
 * Display / monitor — any wall-mounted screen (room display, lobby
 * sign, conference TV). The default footprint is wider than tall to
 * match the most common landscape mount.
 */
export interface DisplayElement extends BaseElement {
  type: 'display'
  model?: string | null
  serialNumber?: string | null
  ipAddress?: string | null
  vendor?: string | null
  installDate?: string | null
  /** Diagonal screen size in inches — display sizes are conventionally
   *  named that way; the canvas footprint stays width×height in canvas
   *  units. */
  screenSizeInches?: number | null
  /** What's connected to it: "MTR Logitech Rally", "Apple TV", etc. */
  connectedDevice?: string | null
  deviceStatus?: 'planned' | 'installed' | 'live' | 'decommissioned' | 'broken' | null
}

/**
 * Video bar — a conference-room camera/mic/speaker bar (e.g. Logitech
 * Rally, Poly Studio). Slim pill silhouette to convey the
 * camera-and-mic-array form factor.
 */
export interface VideoBarElement extends BaseElement {
  type: 'video-bar'
  model?: string | null
  serialNumber?: string | null
  macAddress?: string | null
  ipAddress?: string | null
  vendor?: string | null
  installDate?: string | null
  /** Conferencing platform the bar is registered with. */
  platform?: 'teams' | 'zoom' | 'meet' | 'webex' | 'other' | null
  deviceStatus?: 'planned' | 'installed' | 'live' | 'decommissioned' | 'broken' | null
}

/**
 * Badge reader — door-access card reader. Vertical pill matches the
 * common wall-mounted form factor and helps it stand out next to the
 * door element it controls.
 */
export interface BadgeReaderElement extends BaseElement {
  type: 'badge-reader'
  model?: string | null
  serialNumber?: string | null
  ipAddress?: string | null
  vendor?: string | null
  installDate?: string | null
  /** Door / opening this reader controls — free-form for now, becomes a
   *  door element-id reference in a later phase. */
  controlsDoorLabel?: string | null
  deviceStatus?: 'planned' | 'installed' | 'live' | 'decommissioned' | 'broken' | null
}

/**
 * Electrical outlet / receptacle. Vertical orientation matches the
 * standard US duplex glyph (two slots stacked + ground hole) so the
 * silhouette is recognisable without a label.
 */
export interface OutletElement extends BaseElement {
  type: 'outlet'
  /** Receptacle type. */
  outletType?: 'duplex' | 'quad' | 'usb-combo' | 'floor-box' | 'poke-through' | 'l5-20' | null
  /** Voltage (US default 120). */
  voltage?: number | null
  /** Circuit identifier — free-form ("Panel A · Breaker 12"). */
  circuit?: string | null
  installDate?: string | null
  deviceStatus?: 'planned' | 'installed' | 'live' | 'decommissioned' | 'broken' | null
}

/**
 * Canonical list of IT-device element type strings. Used by the M2
 * library + M3 devices panel to enumerate the full family without
 * having to import every interface. Kept as a `readonly` tuple so the
 * type-system can derive a literal-union from it (`typeof
 * IT_DEVICE_TYPES[number]`) when M2 / M3 need it.
 */
export const IT_DEVICE_TYPES = [
  'access-point',
  'network-jack',
  'display',
  'video-bar',
  'badge-reader',
  'outlet',
] as const

/**
 * Logical IT sub-layer an element belongs to. Used by the future
 * View-menu layer toggles (M2) so users can hide/show e.g. "all power"
 * without touching the broader furniture/walls toggles.
 */
export type ITLayer = 'network' | 'av' | 'security' | 'power'

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
  | SofaElement
  | PlantElement
  | PrinterElement
  | WhiteboardElement
  | RectShapeElement
  | EllipseElement
  | LineShapeElement
  | ArrowElement
  | FreeTextElement
  | CustomSvgElement
  | AccessPointElement
  | NetworkJackElement
  | DisplayElement
  | VideoBarElement
  | BadgeReaderElement
  | OutletElement
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

// Furniture catalog — non-assignable decorative/context elements. Kept out
// of `isAssignableElement` on purpose so insight analyzers (utilisation,
// accommodations, seat churn) never count them.
export function isSofaElement(el: CanvasElement): el is SofaElement {
  return el.type === 'sofa'
}

export function isPlantElement(el: CanvasElement): el is PlantElement {
  return el.type === 'plant'
}

export function isPrinterElement(el: CanvasElement): el is PrinterElement {
  return el.type === 'printer'
}

export function isWhiteboardElement(el: CanvasElement): el is WhiteboardElement {
  return el.type === 'whiteboard'
}

// ---------------------------------------------------------------------------
// IT/AV/Network/Power layer (M1) — type guards + layer router
// ---------------------------------------------------------------------------
//
// One predicate per type matches the convention established by the
// furniture catalog (sofa/plant/printer/whiteboard) above. `isITDevice`
// is the composite predicate the M2 library + M3 devices panel use to
// enumerate the family without re-listing every literal.

export function isAccessPointElement(el: CanvasElement): el is AccessPointElement {
  return el.type === 'access-point'
}

export function isNetworkJackElement(el: CanvasElement): el is NetworkJackElement {
  return el.type === 'network-jack'
}

export function isDisplayElement(el: CanvasElement): el is DisplayElement {
  return el.type === 'display'
}

export function isVideoBarElement(el: CanvasElement): el is VideoBarElement {
  return el.type === 'video-bar'
}

export function isBadgeReaderElement(el: CanvasElement): el is BadgeReaderElement {
  return el.type === 'badge-reader'
}

export function isOutletElement(el: CanvasElement): el is OutletElement {
  return el.type === 'outlet'
}

/**
 * Composite predicate — `true` for any of the six IT-device element
 * types. Implemented via the `IT_DEVICE_TYPES` tuple so that adding a
 * new device in a future PR only requires extending the tuple +
 * shipping a renderer; the predicate updates automatically.
 */
export function isITDevice(el: CanvasElement): boolean {
  return (IT_DEVICE_TYPES as readonly string[]).includes(el.type)
}

/**
 * Map an IT-device element to its logical sub-layer. Returns `null`
 * for non-IT elements (walls, desks, decor, etc.) so the M2 view-menu
 * can short-circuit those without having to enumerate the negative.
 *
 * The mapping is intentionally one-to-one with `IT_DEVICE_TYPES`:
 *
 *   - `network`   access points, network jacks
 *   - `av`        displays, video bars
 *   - `security`  badge readers
 *   - `power`     outlets
 */
export function itLayerOf(el: CanvasElement): ITLayer | null {
  switch (el.type) {
    case 'access-point':
    case 'network-jack':
      return 'network'
    case 'display':
    case 'video-bar':
      return 'av'
    case 'badge-reader':
      return 'security'
    case 'outlet':
      return 'power'
    default:
      return null
  }
}
