import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Box,
  ChevronDown,
  ChevronRight,
  MessageSquarePlus,
  Search,
  SearchX,
  Star,
  Upload,
  X,
} from 'lucide-react'
import { TABLE_SEAT_DEFAULTS, getDefaults } from '../../../lib/constants'
import { LibraryPreview } from './LibraryPreview'
import { Input } from '../../ui/Input'
import { useRecentLibraryItems } from '../../../hooks/useRecentLibraryItems'
import { useLibraryCollapse } from '../../../hooks/useLibraryCollapse'
import { useLibraryFavorites, favoriteKey } from '../../../hooks/useLibraryFavorites'
import { useCustomShapes } from '../../../hooks/useCustomShapes'
import { prefersReducedMotion } from '../../../lib/prefersReducedMotion'
import { sanitizeSvg, MAX_SVG_BYTES } from '../../../lib/svgSanitize'
import {
  addRecent as persistRecent,
  clearRecents as clearRecentsStorage,
  getRecents as readPersistedRecents,
} from '../../../lib/elementLibraryRecents'
import type {
  ElementType,
  TableType,
  TableElement,
  BaseElement,
  DeskElement,
  WorkstationElement,
  PrivateOfficeElement,
  ConferenceRoomElement,
  PhoneBoothElement,
  CommonAreaElement,
  DecorElement,
  DecorShape,
  CustomSvgElement,
  AccessPointElement,
  NetworkJackElement,
  DisplayElement,
  VideoBarElement,
  BadgeReaderElement,
  OutletElement,
} from '../../../types/elements'
import { IT_DEVICE_TYPES } from '../../../types/elements'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useCan } from '../../../hooks/useCan'
import { nanoid } from 'nanoid'
import { computeSeatPositions } from '../../../lib/seatLayout'
import { nextSeatNumber } from '../../../lib/seatNumbering'

export interface LibraryItem {
  type: ElementType
  label: string
  category: string
  shape?: string    // NEW — optional shape override
  /** Only present when type === 'custom-svg'. Inline sanitised SVG source. */
  svgSource?: string
  /** Only present when type === 'custom-svg'. Stable id of the custom shape
   *  so the library tile and the stored shape stay linked (used by the
   *  "×" delete button on the tile). */
  customShapeId?: string
}

/**
 * Mime type carried on the HTML5 drag payload when a library tile is
 * dragged onto the canvas. CanvasStage checks for this mime to distinguish
 * library drags from employee-assignment drags (which use
 * `application/employee-id`).
 */
export const LIBRARY_DRAG_MIME = 'application/floocraft-element-type'

/**
 * Short, file-local copy keyed by `tileKey(item)` (i.e. `type[/shape]`).
 * Used by the hover tooltip — the action records themselves don't carry a
 * `description` field, and we deliberately do not extend `LibraryItem`
 * with one to keep the persisted shape stable. Missing entries fall back
 * to a generic single-line tooltip in the renderer.
 */
const TILE_DESCRIPTIONS: Record<string, string> = {
  'table-rect': 'Rectangular meeting or work table.',
  'table-conference': 'Long conference table with seats around the edges.',
  'table-round': 'Round table — sociable, equal-distance seating.',
  'table-oval': 'Oval table — large boardroom-style meetings.',
  desk: 'Single-person desk with an assignable seat.',
  'hot-desk': 'Unassigned desk available to anyone for the day.',
  'desk/l-shape': 'L-shaped desk — extra surface area for monitors.',
  'desk/cubicle': 'Enclosed cubicle desk for focus work.',
  workstation: 'Multi-person bench, up to four seats.',
  'private-office': 'Walled office with one occupant.',
  'private-office/u-shape': 'U-shaped private office for two people.',
  'conference-room': 'Bookable meeting room with capacity.',
  'phone-booth': 'Single-occupant phone or focus pod.',
  'common-area': 'Shared lounge or breakout zone.',
  chair: 'Standalone office chair.',
  'decor/armchair': 'Lounge armchair for casual seating.',
  'decor/couch': 'Sofa for breakout / casual areas.',
  'decor/column': 'Structural column — block off as obstruction.',
  'decor/stairs': 'Stairs / stairwell footprint.',
  'decor/elevator': 'Elevator shaft footprint.',
  divider: 'Partition wall between zones.',
  planter: 'Decorative planter or large indoor plant.',
  'decor/reception': 'Reception desk near building entrance.',
  'decor/kitchen-counter': 'Kitchen counter / kitchenette block.',
  'decor/fridge': 'Fridge — pantry or break room.',
  'decor/whiteboard': 'Wall-mounted whiteboard.',
  counter: 'Service counter or bar.',
  sofa: 'Three-seat sofa.',
  plant: 'Floor plant — small decorative footprint.',
  printer: 'Shared printer or copier.',
  whiteboard: 'Whiteboard footprint.',
  'custom-shape': 'Generic custom outline — resize freely.',
  'text-label': 'Free-form text label.',
  // IT/AV/Network/Power layer (M2). Tooltip copy doubles as the
  // "what is this and why would I drop it on the floor" hint, so the
  // descriptions lean concrete: name the device class + the most common
  // form factor, not a vague "infrastructure" gloss.
  'access-point': 'Wireless access point — wifi coverage device.',
  'network-jack': 'Network jack / wall outlet for an Ethernet drop.',
  display: 'Wall-mounted display, monitor, or TV.',
  'video-bar': 'Conference video bar (camera + mic + speaker).',
  'badge-reader': 'Door access / badge reader.',
  outlet: 'Power receptacle (single or duplex outlet, USB combo, floor box).',
}

/** Same key shape as the recents helper so descriptions follow shape variants. */
function tileKey(item: LibraryItem): string {
  return `${item.type}${item.shape ? `/${item.shape}` : ''}`
}

const LIBRARY_ITEMS: LibraryItem[] = [
  // Tables
  { type: 'table-rect',        label: 'Rect Table',     category: 'Tables' },
  { type: 'table-conference',  label: 'Conf. Table',    category: 'Tables' },
  { type: 'table-round',       label: 'Round Table',    category: 'Tables' },
  { type: 'table-oval',        label: 'Oval Table',     category: 'Tables' },

  // Desks
  { type: 'desk',              label: 'Desk',           category: 'Desks' },
  { type: 'hot-desk',          label: 'Hot Desk',       category: 'Desks' },
  { type: 'desk',              label: 'L-Shape Desk',   category: 'Desks', shape: 'l-shape' },
  { type: 'desk',              label: 'Cubicle',        category: 'Desks', shape: 'cubicle' },
  { type: 'workstation',       label: 'Workstation',    category: 'Desks' },
  { type: 'private-office',    label: 'Private Office', category: 'Desks' },
  { type: 'private-office',    label: 'U-Shape Office', category: 'Desks', shape: 'u-shape' },

  // Rooms
  { type: 'conference-room',   label: 'Conference Room', category: 'Rooms' },
  { type: 'phone-booth',       label: 'Phone Booth',     category: 'Rooms' },
  { type: 'common-area',       label: 'Common Area',     category: 'Rooms' },

  // Seating
  { type: 'chair',             label: 'Office Chair',    category: 'Seating' },
  { type: 'decor',             label: 'Armchair',        category: 'Seating', shape: 'armchair' },
  { type: 'decor',             label: 'Couch',           category: 'Seating', shape: 'couch' },

  // Structure
  { type: 'decor',             label: 'Column',          category: 'Structure', shape: 'column' },
  { type: 'decor',             label: 'Stairs',          category: 'Structure', shape: 'stairs' },
  { type: 'decor',             label: 'Elevator',        category: 'Structure', shape: 'elevator' },
  { type: 'divider',           label: 'Divider',         category: 'Structure' },
  { type: 'planter',           label: 'Planter',         category: 'Structure' },

  // Facilities
  { type: 'decor',             label: 'Reception Desk',  category: 'Facilities', shape: 'reception' },
  { type: 'decor',             label: 'Kitchen Counter', category: 'Facilities', shape: 'kitchen-counter' },
  { type: 'decor',             label: 'Fridge',          category: 'Facilities', shape: 'fridge' },
  { type: 'decor',             label: 'Whiteboard',      category: 'Facilities', shape: 'whiteboard' },
  { type: 'counter',           label: 'Counter',         category: 'Facilities' },

  // Furniture — decorative/context props (non-assignable). See
  // `src/types/elements.ts` for the discriminated-union members.
  { type: 'sofa',              label: 'Sofa',            category: 'Furniture' },
  { type: 'plant',             label: 'Plant',           category: 'Furniture' },
  { type: 'printer',           label: 'Printer',         category: 'Furniture' },
  { type: 'whiteboard',        label: 'Whiteboard',      category: 'Furniture' },

  // IT / Infrastructure (M2). Six tiles for the new IT-device family
  // shipped in M1. Sentence-case labels match the user-facing copy in
  // tooltips and the View-menu toggles for consistency. Single category
  // (rather than four sub-categories per logical layer) because the
  // family is small enough that a flat group reads cleaner — the
  // sub-layer is exposed at the View-menu level instead.
  { type: 'access-point',      label: 'Access point',    category: 'IT / Infrastructure' },
  { type: 'network-jack',      label: 'Network jack',    category: 'IT / Infrastructure' },
  { type: 'display',           label: 'Display',         category: 'IT / Infrastructure' },
  { type: 'video-bar',         label: 'Video bar',       category: 'IT / Infrastructure' },
  { type: 'badge-reader',      label: 'Badge reader',    category: 'IT / Infrastructure' },
  { type: 'outlet',            label: 'Outlet',          category: 'IT / Infrastructure' },

  // Other
  { type: 'custom-shape',      label: 'Custom Shape',    category: 'Other' },
  { type: 'text-label',        label: 'Text Label',      category: 'Other' },
]

/**
 * Set of IT-device types — used to filter library items when the viewer
 * lacks the `viewITLayer` permission so the tiles disappear cleanly.
 * Built from the canonical M1 tuple so adding a new device type only
 * requires editing `IT_DEVICE_TYPES` in `types/elements.ts`.
 */
const IT_DEVICE_TYPE_SET = new Set<ElementType>(IT_DEVICE_TYPES)

function isTableType(type: ElementType): type is TableType {
  return type === 'table-rect' || type === 'table-conference' || type === 'table-round' || type === 'table-oval'
}

type AnyLibraryElement =
  | TableElement
  | DeskElement
  | WorkstationElement
  | PrivateOfficeElement
  | ConferenceRoomElement
  | PhoneBoothElement
  | CommonAreaElement
  | DecorElement
  // IT/AV/Network/Power layer (M2). Each lands in `addElement` as its
  // own discriminated-union member so `ElementRenderer` can dispatch to
  // the renderer the M1 wave shipped without an extra cast.
  | AccessPointElement
  | NetworkJackElement
  | DisplayElement
  | VideoBarElement
  | BadgeReaderElement
  | OutletElement
  | BaseElement

/**
 * Build (but do not insert) an element from a library item at the given
 * canvas-space coords. Extracted so the click-to-add path (centres in the
 * current viewport) and the drag-to-canvas path (drops at the cursor)
 * share the exact same factory — keep this pure so it can be called from
 * the library tile click handler or from CanvasStage's drop handler.
 *
 * Lives next to the component because it's a one-caller helper; the
 * fast-refresh warning is a non-issue (no hot-reload surface worth
 * splitting a file for).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function buildLibraryElement(
  item: LibraryItem,
  x: number,
  y: number,
  zIndex: number,
  /**
   * Current floor's elements — passed in so the assignable-element
   * branches can hand out a sequential `deskId` ("1", "2", "3" …).
   * Omitting this (callers from tests, etc.) falls back to `"1"`.
   */
  existingElements: Record<string, import('../../../types/elements').CanvasElement> = {},
): AnyLibraryElement {
  const defaults = getDefaults(item.type, item.shape) || { width: 60, height: 60, fill: '#F3F4F6', stroke: '#6B7280' }
  const id = nanoid()

  const baseProps = {
    id,
    x,
    y,
    width: defaults.width,
    height: defaults.height,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex,
    label: item.label,
    visible: true,
    style: { fill: defaults.fill, stroke: defaults.stroke, strokeWidth: 2, opacity: 1 },
  } as const

  if (isTableType(item.type)) {
    const seatCount = TABLE_SEAT_DEFAULTS[item.type] || 6
    const layout = item.type === 'table-conference' || item.type === 'table-round' || item.type === 'table-oval' ? 'around' as const : 'both-sides' as const
    const element: TableElement = {
      ...baseProps,
      type: item.type,
      seatCount,
      seatLayout: layout,
      seats: computeSeatPositions(item.type, seatCount, layout, defaults.width, defaults.height),
    }
    return element
  }

  if (item.type === 'desk' || item.type === 'hot-desk') {
    // Sequential "1", "2", "3"… per floor — see `nextSeatNumber` for the
    // scoping rules. Workstations and private offices use the same
    // counter so we never hand out "W-4" while a desk is also "4".
    const deskId = nextSeatNumber(existingElements)
    const element: DeskElement = {
      ...baseProps,
      type: item.type,
      deskId,
      assignedEmployeeId: null,
      capacity: 1,
      ...(item.shape ? { shape: item.shape as DeskElement['shape'] } : {}),
    }
    return element
  }

  if (item.type === 'workstation') {
    const deskId = nextSeatNumber(existingElements)
    const positions = 4
    const element: WorkstationElement = {
      ...baseProps,
      type: 'workstation',
      deskId,
      positions,
      // Sparse positional array — one `null` per slot. The renderer
      // and per-slot drop logic expect length === `positions`, so we
      // initialise that invariant at construction time.
      assignedEmployeeIds: Array.from({ length: positions }, () => null),
    }
    return element
  }

  if (item.type === 'private-office') {
    const deskId = nextSeatNumber(existingElements)
    const element: PrivateOfficeElement = {
      ...baseProps,
      type: 'private-office',
      deskId,
      capacity: item.shape === 'u-shape' ? 2 : 1,
      assignedEmployeeIds: [],
      ...(item.shape ? { shape: item.shape as PrivateOfficeElement['shape'] } : {}),
    }
    return element
  }

  if (item.type === 'conference-room') {
    const element: ConferenceRoomElement = {
      ...baseProps,
      type: 'conference-room',
      roomName: 'Conference Room',
      capacity: 8,
    }
    return element
  }

  if (item.type === 'phone-booth') {
    const element: PhoneBoothElement = {
      ...baseProps,
      type: 'phone-booth',
    }
    return element
  }

  if (item.type === 'common-area') {
    const element: CommonAreaElement = {
      ...baseProps,
      type: 'common-area',
      areaName: 'Common Area',
    }
    return element
  }

  if (item.type === 'decor') {
    const el: DecorElement = {
      ...baseProps,
      type: 'decor',
      shape: item.shape as DecorShape,
    } as DecorElement
    return el
  }

  if (item.type === 'custom-svg' && item.svgSource) {
    const el: CustomSvgElement = {
      ...baseProps,
      type: 'custom-svg',
      svgSource: item.svgSource,
    }
    return el
  }

  // IT/AV/Network/Power layer (M2). Each device starts blank — no model,
  // no serial, status-undefined — because the M3 Devices panel + the
  // properties form are where users fill in the real metadata. Returning
  // a typed shell here keeps the discriminated union honest at construct
  // time so `ElementRenderer` doesn't need a defensive runtime check.
  if (item.type === 'access-point') {
    const el: AccessPointElement = { ...baseProps, type: 'access-point' }
    return el
  }
  if (item.type === 'network-jack') {
    const el: NetworkJackElement = { ...baseProps, type: 'network-jack' }
    return el
  }
  if (item.type === 'display') {
    const el: DisplayElement = { ...baseProps, type: 'display' }
    return el
  }
  if (item.type === 'video-bar') {
    const el: VideoBarElement = { ...baseProps, type: 'video-bar' }
    return el
  }
  if (item.type === 'badge-reader') {
    const el: BadgeReaderElement = { ...baseProps, type: 'badge-reader' }
    return el
  }
  if (item.type === 'outlet') {
    const el: OutletElement = { ...baseProps, type: 'outlet' }
    return el
  }

  // Default: generic BaseElement for chair, counter, divider, planter, custom-shape, text-label
  const element: BaseElement = {
    ...baseProps,
    type: item.type,
  }
  return element
}

function itemKey(item: LibraryItem): string {
  return `${item.type}${item.shape ? `-${item.shape}` : ''}-${item.label}`
}

interface LibraryTileProps {
  item: LibraryItem
  onClick: (item: LibraryItem) => void
  onDragStart: (item: LibraryItem) => (e: React.DragEvent<HTMLElement>) => void
  /** Present only for user-uploaded custom SVGs. Shows an "×" in place of
   *  the star so the shape can be removed from the library. */
  onDelete?: (item: LibraryItem) => void
  /** True when this tile's element type matches the canvas's active tool.
   *  Drives the stronger highlight class. Most library items are factories
   *  (not tools) so this is normally false — but kept generic in case a
   *  future tile maps directly to a canvas tool. */
  isActive?: boolean
  /** Callback when hover passes the dwell threshold (250ms). The owning
   *  ElementLibrary keeps a single shared tooltip rather than one per tile
   *  so 50 idle tiles don't allocate 50 tooltip nodes. */
  onHoverEnter?: (item: LibraryItem, anchor: HTMLElement) => void
  /** Hover left or drag started — tear the tooltip down. */
  onHoverLeave?: (item: LibraryItem) => void
}

function LibraryTile({
  item,
  onClick,
  onDragStart,
  onDelete,
  isActive,
  onHoverEnter,
  onHoverLeave,
}: LibraryTileProps) {
  const isFavorite = useLibraryFavorites((s) => s.favorites.has(favoriteKey(item)))
  const toggleFavorite = useLibraryFavorites((s) => s.toggleFavorite)
  const wrapperRef = useRef<HTMLDivElement>(null)
  // Local visual flag while this tile is the active drag source. We could
  // read it from a parent provider, but the dragging tile is always the
  // one whose `dragstart` fired, so a tile-local boolean is the cleanest
  // representation. `dragend` clears it whether or not the drop succeeded.
  const [isDragging, setIsDragging] = useState(false)

  const handleStarClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggleFavorite(item)
  }

  const handleDeleteClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete?.(item)
  }

  const handleMouseEnter = () => {
    if (wrapperRef.current) onHoverEnter?.(item, wrapperRef.current)
  }
  const handleMouseLeave = () => {
    onHoverLeave?.(item)
  }

  return (
    <div
      ref={wrapperRef}
      draggable
      onDragStart={(e) => {
        // Tear down any pending tooltip so it doesn't race the drag image.
        onHoverLeave?.(item)
        setIsDragging(true)
        onDragStart(item)(e)
      }}
      onDragEnd={() => setIsDragging(false)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      aria-label={`Add ${item.label} element to canvas`}
      title="Drag onto the canvas, or click to add at viewport centre"
      // The wrapper owns the drag; the inner <button> handles click-to-add.
      // The star sits above as a sibling with its own keyboard handler so
      // Tab reaches it and Space/Enter toggles without placing the element.
      //
      // Chrome treatment: rounded-md card with a paired light/dark shell.
      // Hover lifts to a blue accent border + faint shadow — `motion-reduce`
      // strips the shadow so users on reduced-motion don't see the tile
      // "pop" when their cursor crosses it. While dragging we drop opacity
      // and apply a tiny rotation so the user can still see the drag image
      // is the tile they grabbed (Konva canvas swallows the native drag
      // ghost on most browsers, so the source-side affordance matters).
      className={`group relative flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md border transition-colors hover:shadow-sm motion-reduce:hover:shadow-none ${
        isDragging
          ? 'opacity-50 cursor-grabbing rotate-[1deg]'
          : 'cursor-grab active:cursor-grabbing'
      } ${
        isActive
          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 border-blue-300 dark:border-blue-700'
          : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 hover:border-blue-400 dark:hover:border-blue-500'
      }`}
    >
      <button
        type="button"
        onClick={() => onClick(item)}
        className="flex items-center gap-1.5 flex-1 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <LibraryPreview item={item} />
        <span className="truncate">{item.label}</span>
      </button>
      {onDelete ? (
        <button
          type="button"
          aria-label={`Remove ${item.label} from library`}
          onClick={handleDeleteClick}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') handleDeleteClick(e)
          }}
          className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
        >
          <X size={12} aria-hidden="true" className="text-gray-400 dark:text-gray-500 hover:text-red-500" />
        </button>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={isFavorite}
          aria-label={isFavorite ? `Unfavourite ${item.label}` : `Favourite ${item.label}`}
          onClick={handleStarClick}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') handleStarClick(e)
          }}
          className={`absolute top-0.5 right-0.5 p-0.5 rounded transition-opacity focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
            isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Star
            size={12}
            aria-hidden="true"
            className={isFavorite ? 'fill-amber-400 text-amber-400' : 'text-gray-400 dark:text-gray-500'}
          />
        </button>
      )}
    </div>
  )
}

interface LibrarySectionProps {
  id: string
  title: string
  items: LibraryItem[]
  /** When true, a chevron toggles visibility. "Recent"/"Favorites"/search
   *  result sections pass false so they always render. */
  collapsible?: boolean
  /** Whether to render a faint top border above the section header. Used
   *  between adjacent categories to give the eye a soft hand-rail without
   *  introducing a heavier divider that would compete with the tiles. */
  showDivider?: boolean
  /** Optional trailing element rendered to the right of the section header.
   *  "Recent" uses this to tuck a clear-recents button next to the count. */
  headerAction?: React.ReactNode
  /** When true, the count badge is suppressed. The "Recent" section already
   *  caps at a small number, so showing "Recent · 3" doesn't add much and
   *  competes with the trailing clear-recents action. */
  hideCount?: boolean
  onClick: (item: LibraryItem) => void
  onDragStart: (item: LibraryItem) => (e: React.DragEvent<HTMLElement>) => void
  /** Per-tile delete handler; forwarded to LibraryTile's onDelete. Used by
   *  "My Shapes" to let users remove uploaded custom SVGs. */
  onDelete?: (item: LibraryItem) => void
  /** Predicate the section uses to mark a tile as the active tool. */
  isActive?: (item: LibraryItem) => boolean
  onHoverEnter?: (item: LibraryItem, anchor: HTMLElement) => void
  onHoverLeave?: (item: LibraryItem) => void
}

function LibrarySection({
  id,
  title,
  items,
  collapsible = true,
  showDivider = false,
  headerAction,
  hideCount = false,
  onClick,
  onDragStart,
  onDelete,
  isActive,
  onHoverEnter,
  onHoverLeave,
}: LibrarySectionProps) {
  // If the user hasn't explicitly toggled this section, fall back to the
  // per-category default — most sections start collapsed (see the hook)
  // so the library is scannable on first open instead of a wall of tiles.
  const defaultCollapsed = useLibraryCollapse((s) => s.defaultCollapsed(id))
  const stored = useLibraryCollapse((s) => s.collapsed[id])
  const collapsed = stored ?? defaultCollapsed
  const toggle = useLibraryCollapse((s) => s.toggleCategory)
  const isCollapsed = collapsible && collapsed

  if (items.length === 0) return null

  // Header copy: "Tables · 4" — a middle-dot separator is the convention
  // we use on the team and roster headers, so the library inherits the
  // same visual idiom. Count is hidden for ad-hoc sections like "Recent"
  // where it would visually fight with a trailing action button.
  const titleText = hideCount ? title : `${title} · ${items.length}`
  // Tracked-caps idiom shared with sibling panels (LayerVisibility, Tools).
  // Centralising the class string here means the next palette tweak is a
  // single-line change rather than spread across three call sites.
  const HEADER_CLASS =
    'text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500'

  return (
    <div className={`mb-3 ${showDivider ? 'pt-3 border-t border-gray-100 dark:border-gray-800/60' : ''}`}>
      <div className="flex items-center gap-1 mb-1">
        {collapsible ? (
          <button
            type="button"
            onClick={() => toggle(id)}
            className={`flex items-center gap-1 hover:text-gray-600 dark:hover:text-gray-300 ${HEADER_CLASS}`}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
            <span>{titleText}</span>
          </button>
        ) : (
          <div className={`px-1 ${HEADER_CLASS}`}>{titleText}</div>
        )}
        {headerAction ? <div className="ml-auto flex items-center">{headerAction}</div> : null}
      </div>
      {!isCollapsed && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-1">
          {items.map((item) => (
            <LibraryTile
              key={itemKey(item)}
              item={item}
              onClick={onClick}
              onDragStart={onDragStart}
              onDelete={onDelete}
              isActive={isActive?.(item)}
              onHoverEnter={onHoverEnter}
              onHoverLeave={onHoverLeave}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ElementLibrary() {
  const canEdit = useCan('editMap')
  // Annotations are gated on `editRoster || editMap` — the same rule
  // CanvasStage applies when the pin-tool click lands. HR editors can
  // leave notes on the map even though they can't move elements, so we
  // show the pin button when either permission grants access.
  // Read the second permission unconditionally so React-hooks rules stay
  // happy (`useCan('a') || useCan('b')` would short-circuit).
  const canEditRosterForAnnotations = useCan('editRoster')
  const canAnnotate = canEdit || canEditRosterForAnnotations
  // M2: IT-device tiles only appear for users who have `viewITLayer`.
  // The canvas-level renderer ALSO gates on this permission, but
  // hiding the tiles up here is the defensive primary surface — a
  // user without permission shouldn't see an affordance they can drag.
  const canViewITLayer = useCan('viewITLayer')
  const activeTool = useCanvasStore((s) => s.activeTool)
  const setActiveTool = useCanvasStore((s) => s.setActiveTool)
  const addElement = useElementsStore((s) => s.addElement)
  const getMaxZIndex = useElementsStore((s) => s.getMaxZIndex)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const stageX = useCanvasStore((s) => s.stageX)
  const stageY = useCanvasStore((s) => s.stageY)
  // Wave 12B: ElementLibrary is now the source of truth for the "Recent"
  // row, backed by `lib/elementLibraryRecents` (pure localStorage helper).
  // The legacy zustand `useRecentLibraryItems` store stays in place — it's
  // also written to from CanvasStage's drop handler (out of scope for this
  // wave) — and we mirror our writes there so both lists stay in sync.
  const addZustandRecent = useRecentLibraryItems((s) => s.addRecent)
  const favoriteSet = useLibraryFavorites((s) => s.favorites)
  const customShapes = useCustomShapes((s) => s.shapes)
  const addCustomShape = useCustomShapes((s) => s.addShape)
  const removeCustomShape = useCustomShapes((s) => s.removeShape)
  const [query, setQuery] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [recents, setRecents] = useState<LibraryItem[]>(() =>
    readPersistedRecents(),
  )
  // Single shared tooltip target. Lives in component state so we don't
  // mount one tooltip per tile. `null` means "no hover preview shown".
  const [hovered, setHovered] = useState<{
    item: LibraryItem
    rect: DOMRect
  } | null>(null)
  // Suppressed during a drag so the tooltip doesn't follow the drag image
  // around — see `dragInProgress` checks below.
  const [dragInProgress, setDragInProgress] = useState(false)
  // Two-stage confirm for the clear-recents button. `true` when the user
  // has clicked the X once and we're waiting for either a second click
  // (commit) or a click elsewhere (dismiss).
  const [confirmingClearRecents, setConfirmingClearRecents] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const bumpRecent = useCallback(
    (item: LibraryItem) => {
      const next = persistRecent(item)
      setRecents(next)
      // Keep the legacy zustand store warm so CanvasStage's drop handler
      // (and any other consumer outside this component) sees the update.
      try {
        addZustandRecent(item)
      } catch {
        /* defensive: never block placement on recents bookkeeping */
      }
    },
    [addZustandRecent],
  )

  // Listen for cross-window updates so two open tabs/floor panels stay in
  // sync. Cheap: 1 listener for the lifetime of the editor.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'floocraft.elementLibrary.recent') {
        setRecents(readPersistedRecents())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Tear down any pending hover timer on unmount so we don't fire setState
  // after the component is gone.
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  // Click-anywhere-else dismisses the clear-recents confirm. We use a
  // window-level listener because the X button itself stops propagation
  // — anything that bubbles up to window therefore happened "outside"
  // the confirm and should reset the armed state. Cheap (1 listener,
  // only attached while the confirm is armed).
  useEffect(() => {
    if (!confirmingClearRecents) return
    const onWindowClick = () => setConfirmingClearRecents(false)
    window.addEventListener('click', onWindowClick)
    return () => window.removeEventListener('click', onWindowClick)
  }, [confirmingClearRecents])

  const handleHoverEnter = useCallback(
    (item: LibraryItem, anchor: HTMLElement) => {
      if (dragInProgress) return
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = setTimeout(() => {
        setHovered({ item, rect: anchor.getBoundingClientRect() })
      }, 250)
    },
    [dragInProgress],
  )

  const handleHoverLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setHovered(null)
  }, [])
  // Running offset for click-to-add placements. When the same spot is used
  // repeatedly (user click-click-clicks the same tile), each subsequent
  // placement nudges down-and-right by CLICK_ADD_STEP so elements don't
  // stack invisibly on top of each other. Resets whenever the viewport
  // centre changes, so moving the canvas or zooming restarts the cascade.
  const cascadeRef = useRef<{ cx: number; cy: number; count: number }>({
    cx: NaN,
    cy: NaN,
    count: 0,
  })

  const handleUploadClick = () => {
    setUploadError(null)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so the same file can be re-selected after a rejection.
    e.target.value = ''
    if (!file) return

    if (file.size > MAX_SVG_BYTES) {
      setUploadError(`File is too large (max ${Math.round(MAX_SVG_BYTES / 1024)}KB).`)
      return
    }

    try {
      const text = await file.text()
      const result = sanitizeSvg(text)
      if (!result.ok || !result.svg) {
        const msg =
          result.error === 'too-large' ? 'File is too large.'
          : result.error === 'not-svg' ? 'File does not look like an SVG.'
          : result.error === 'invalid-xml' ? 'SVG could not be parsed.'
          : 'SVG is empty.'
        setUploadError(msg)
        return
      }
      // Strip extension for the label.
      const name = file.name.replace(/\.svg$/i, '').slice(0, 32) || 'Custom Shape'
      const shape = addCustomShape(name, result.svg)
      if (!shape) {
        setUploadError('Library full — delete a custom shape first.')
        return
      }
      setUploadError(null)
    } catch {
      setUploadError('Could not read file.')
    }
  }

  const handleAddElement = (item: LibraryItem) => {
    // Click-to-add drops the element near the centre of the current
    // viewport (approx 400, 300 screen px from the canvas origin).
    const cx = (-stageX + 400) / stageScale
    const cy = (-stageY + 300) / stageScale

    // Cascade: repeatedly clicking the same tile would otherwise pile
    // elements on the exact same coordinate and the user thinks nothing
    // happened. Nudge each successive placement by a constant step until
    // the viewport centre changes (pan/zoom resets the cascade).
    const CLICK_ADD_STEP = 16
    const same =
      Math.abs(cascadeRef.current.cx - cx) < 0.5 &&
      Math.abs(cascadeRef.current.cy - cy) < 0.5
    const count = same ? cascadeRef.current.count + 1 : 0
    cascadeRef.current = { cx, cy, count }
    const x = cx + count * CLICK_ADD_STEP
    const y = cy + count * CLICK_ADD_STEP

    // Read elements via getState() so we don't re-subscribe the component
    // to the whole map just to auto-number a new seat.
    const existing = useElementsStore.getState().elements
    addElement(buildLibraryElement(item, x, y, getMaxZIndex() + 1, existing))
    bumpRecent(item)
  }

  // Drag-to-canvas: serialise the LibraryItem into the drag payload. The
  // CanvasStage drop handler reads this, translates the drop coords into
  // canvas space, and calls buildLibraryElement at the cursor.
  // We bump the recents list at drag-start (rather than drop) — detecting
  // drop completion would require crossing into CanvasStage, which is out
  // of scope for this wave. False positives (drag cancelled before drop)
  // are acceptable: the tile clearly intended to be used.
  const handleDragStart =
    (item: LibraryItem) => (e: React.DragEvent<HTMLElement>) => {
      e.dataTransfer.setData(LIBRARY_DRAG_MIME, JSON.stringify(item))
      e.dataTransfer.effectAllowed = 'copy'
      bumpRecent(item)
      setDragInProgress(true)
      // Tear down any visible tooltip so it doesn't fight the drag image.
      handleHoverLeave()
      // Drag-end fires regardless of drop success on the same element.
      const target = e.currentTarget
      const onEnd = () => {
        setDragInProgress(false)
        target.removeEventListener('dragend', onEnd)
      }
      target.addEventListener('dragend', onEnd)
    }

  // IT-device tiles fold out of the library entirely when the viewer
  // lacks `viewITLayer`. Computing the visible list here lets every
  // downstream loop (categories, favorites, search filter) use the
  // permission-respecting subset without each having to know about the
  // gate.
  const visibleLibraryItems = useMemo(
    () =>
      canViewITLayer
        ? LIBRARY_ITEMS
        : LIBRARY_ITEMS.filter((i) => !IT_DEVICE_TYPE_SET.has(i.type)),
    [canViewITLayer],
  )

  const categories = useMemo(
    () => [...new Set(visibleLibraryItems.map((i) => i.category))],
    [visibleLibraryItems],
  )

  // Project each persisted CustomShape into a LibraryItem so it flows through
  // the same tile/drag/click pipeline as the built-in library entries.
  const customShapeItems = useMemo<LibraryItem[]>(
    () =>
      customShapes.map((s) => ({
        type: 'custom-svg' as const,
        label: s.name,
        category: 'My Shapes',
        svgSource: s.svgSource,
        customShapeId: s.id,
      })),
    [customShapes],
  )

  const handleDeleteCustom = (item: LibraryItem) => {
    if (item.customShapeId) removeCustomShape(item.customShapeId)
  }

  const q = query.trim().toLowerCase()
  const isSearching = q.length > 0
  // Match against label OR category (case-insensitive substring on each).
  // The action records don't currently carry a `tags` field, so tag-based
  // matching is a no-op for now — if we later add tags, extend this here.
  const matchesQuery = useCallback(
    (i: LibraryItem) => {
      if (!isSearching) return true
      return (
        i.label.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      )
    },
    [isSearching, q],
  )
  const filtered = useMemo(
    () =>
      isSearching
        ? [...visibleLibraryItems, ...customShapeItems].filter(matchesQuery)
        : [],
    [isSearching, visibleLibraryItems, customShapeItems, matchesQuery],
  )
  const favoriteItems = useMemo(
    () => visibleLibraryItems.filter((i) => favoriteSet.has(favoriteKey(i))),
    [visibleLibraryItems, favoriteSet],
  )

  // Viewers can't place anything — the library is inert for them. Hiding
  // the entire tile grid (instead of disabling each tile) keeps the UI
  // honest: a panel that looks interactive but silently ignores clicks is
  // worse than an obvious view-only placard.
  //
  // HR-editors (who have `editRoster` but not `editMap`) DON'T have the
  // library surface either, but they DO get the annotation pin so they
  // can leave notes tied to desks/people without needing map privileges.
  if (!canEdit) {
    return (
      <div className="p-4 text-xs text-gray-500 dark:text-gray-400 space-y-2 flex-1 min-h-0 overflow-y-auto">
        {canAnnotate && (
          <button
            type="button"
            onClick={() => setActiveTool(activeTool === 'pin' ? 'select' : 'pin')}
            aria-pressed={activeTool === 'pin'}
            title="Click an element or empty canvas to add a sticky note (280 chars max)"
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded border transition-colors ${
              activeTool === 'pin'
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 border-amber-300'
                : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:border-gray-300'
            }`}
          >
            <MessageSquarePlus size={14} aria-hidden="true" />
            <span className="flex-1 text-left">Annotation pin</span>
          </button>
        )}
        <div className="font-medium text-gray-600 dark:text-gray-300">View-only</div>
        <div>You don't have permission to add elements to this office.</div>
      </div>
    )
  }

  // Esc keystroke contract on the search input:
  //   - first Esc with text → clears the query (keeps focus so the user
  //     can immediately type a new search without re-clicking).
  //   - second Esc on an empty input → blurs, returning focus to the
  //     editor body so canvas keybindings (V, H, Z…) take over again.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (query.length > 0) {
        e.preventDefault()
        setQuery('')
      } else {
        e.currentTarget.blur()
      }
    }
  }

  // Convenience predicate: does an item match the canvas's active tool?
  // Most LIBRARY_ITEMS are factories (not tools) so this is normally false,
  // but `pin` etc. could overlap and the highlight makes the matched tile
  // stand out at a glance.
  const isActiveTool = (item: LibraryItem) =>
    (activeTool as string) === (item.type as string)

  return (
    // The outer sidebar (`MapView.tsx`) now owns the scrollbar for the
    // whole left column, so the library renders at its natural height
    // and stacks cleanly below ToolSelector + LayerVisibilityPanel.
    // `pb-6` keeps visible breathing room under the final row when the
    // user scrolls to the bottom of the sidebar.
    <div className="p-3 pb-6 relative">
      {/* Search input. The Wave 19A polish swaps the bare <input> for the
          shared `<Input>` primitive so the focus-ring and dark-mode shell
          match the rest of the app, and adds a leading Search icon — small
          but a strong "this field is searchable" affordance.

          Why no `/` global focus shortcut: the app's `useKeyboardShortcuts`
          already binds `/` to the global command palette (Linear / GitHub
          convention). Adding a local `/` handler here would race the
          global one. Users who want fast keyboard nav land in the command
          palette instead — which itself can navigate to the library. */}
      <div className="relative mb-3">
        <Search
          size={14}
          aria-hidden="true"
          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none"
        />
        <Input
          ref={searchInputRef}
          size="sm"
          type="search"
          aria-label="Filter elements"
          placeholder="Search elements"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="pl-7"
        />
      </div>
      {canAnnotate && (
        // Pin tool: a one-off entry here (rather than a LibraryItem)
        // because it's a canvas *tool*, not an element factory. Sets
        // `canvasStore.activeTool` so the next CanvasStage click lands
        // through the pin-tool branch in handleMouseDown.
        <button
          type="button"
          onClick={() => setActiveTool(activeTool === 'pin' ? 'select' : 'pin')}
          aria-pressed={activeTool === 'pin'}
          title="Click an element or empty canvas to add a sticky note (280 chars max)"
          className={`w-full mb-3 flex items-center gap-2 px-2.5 py-1.5 text-xs rounded border transition-colors ${
            activeTool === 'pin'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 border-amber-300'
              : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:border-gray-300'
          }`}
        >
          <MessageSquarePlus size={14} aria-hidden="true" />
          <span className="flex-1 text-left">Annotation pin</span>
          {activeTool === 'pin' && (
            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">ESC</span>
          )}
        </button>
      )}
      {/* Recent row — always visible when populated. Search ignores it so
          frequently-used tiles are always one click away even mid-filter.
          Capped at 6 to fill exactly one row at the 3-column lg breakpoint
          (and a clean two rows at 2-col); beyond that the list ages out
          per `addRecent`'s move-to-front, so the cap is purely visual. */}
      {recents.length > 0 && (
        <LibrarySection
          id="recent"
          title="Recent"
          items={recents.slice(0, 6)}
          collapsible={false}
          hideCount
          onClick={handleAddElement}
          onDragStart={handleDragStart}
          isActive={isActiveTool}
          onHoverEnter={handleHoverEnter}
          onHoverLeave={handleHoverLeave}
          headerAction={
            // Two-stage clear: first click arms a confirm tooltip, second
            // click commits. Single-click-to-wipe is too easy to fat-finger
            // when the row sits right under the search input. The confirm
            // is dismissed by a click anywhere else (capture-phase listener
            // installed below) so it doesn't linger after a missed click.
            <button
              type="button"
              aria-label={
                confirmingClearRecents
                  ? 'Confirm clear recent elements'
                  : 'Clear recent elements'
              }
              onClick={(e) => {
                e.stopPropagation()
                if (confirmingClearRecents) {
                  setRecents([])
                  clearRecentsStorage()
                  setConfirmingClearRecents(false)
                } else {
                  setConfirmingClearRecents(true)
                }
              }}
              className={`flex items-center gap-1 px-1 py-0.5 rounded text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                confirmingClearRecents
                  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title={
                confirmingClearRecents
                  ? 'Click again to confirm'
                  : 'Clear recent elements'
              }
            >
              {confirmingClearRecents ? (
                <span>Clear?</span>
              ) : (
                <X size={12} aria-hidden="true" />
              )}
            </button>
          }
        />
      )}
      {/* Defensive empty-catalog state. Today LIBRARY_ITEMS is a static
          constant so the array is never empty, but the section is here so
          a future tenant-config-driven catalog can degrade gracefully —
          users see a helpful placard instead of an unexplained blank panel.
          The check covers built-ins + custom shapes; recents are excluded
          (a recents-only library would still be useful). */}
      {visibleLibraryItems.length === 0 && customShapeItems.length === 0 ? (
        <div
          role="status"
          className="flex flex-col items-center gap-2 py-8 px-3 text-xs text-gray-500 dark:text-gray-400 rounded-md border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 text-center"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            <Box size={18} aria-hidden="true" />
          </span>
          <div className="font-medium text-gray-600 dark:text-gray-300">
            No elements available
          </div>
          <div className="leading-snug">
            Try clearing your search or asking your admin.
          </div>
        </div>
      ) : isSearching ? (
        filtered.length === 0 ? (
          // Empty-search placard. We keep the "No elements match" line as
          // the primary anchor for screen-reader status announcements (and
          // existing tests assert that exact substring), and append a more
          // descriptive line that quotes the query so users see exactly
          // which token came back empty — typos are the most common cause.
          <div
            role="status"
            className="flex flex-col items-center gap-2 py-6 text-xs text-gray-500 dark:text-gray-400 rounded-md border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40"
          >
            <SearchX size={20} aria-hidden="true" className="text-gray-400" />
            <div>No elements match</div>
            <div className="text-gray-400 dark:text-gray-500 truncate max-w-full px-3 text-center">
              "{query}"
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                searchInputRef.current?.focus()
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
            >
              Clear
            </button>
          </div>
        ) : (
          <>
            {favoriteItems.filter(matchesQuery).length > 0 && (
              <LibrarySection
                id="favorites"
                title="Favorites"
                items={favoriteItems.filter(matchesQuery)}
                collapsible={false}
                onClick={handleAddElement}
                onDragStart={handleDragStart}
                isActive={isActiveTool}
                onHoverEnter={handleHoverEnter}
                onHoverLeave={handleHoverLeave}
              />
            )}
            {categories.map((cat, idx) => {
              const matched = visibleLibraryItems.filter(
                (i) => i.category === cat && matchesQuery(i),
              )
              if (matched.length === 0) return null
              return (
                <LibrarySection
                  key={cat}
                  id={cat}
                  title={cat}
                  items={matched}
                  showDivider={idx > 0}
                  onClick={handleAddElement}
                  onDragStart={handleDragStart}
                  isActive={isActiveTool}
                  onHoverEnter={handleHoverEnter}
                  onHoverLeave={handleHoverLeave}
                />
              )
            })}
            {customShapeItems.filter(matchesQuery).length > 0 && (
              <LibrarySection
                id="my-shapes"
                title="My Shapes"
                items={customShapeItems.filter(matchesQuery)}
                collapsible={true}
                onClick={handleAddElement}
                onDragStart={handleDragStart}
                onDelete={handleDeleteCustom}
                isActive={isActiveTool}
                onHoverEnter={handleHoverEnter}
                onHoverLeave={handleHoverLeave}
              />
            )}
          </>
        )
      ) : (
        <>
          {favoriteItems.length > 0 && (
            <LibrarySection
              id="favorites"
              title="Favorites"
              items={favoriteItems}
              collapsible={false}
              onClick={handleAddElement}
              onDragStart={handleDragStart}
              isActive={isActiveTool}
              onHoverEnter={handleHoverEnter}
              onHoverLeave={handleHoverLeave}
            />
          )}
          {categories.map((cat, idx) => (
            <LibrarySection
              key={cat}
              id={cat}
              title={cat}
              items={visibleLibraryItems.filter((i) => i.category === cat)}
              showDivider={idx > 0}
              onClick={handleAddElement}
              onDragStart={handleDragStart}
              isActive={isActiveTool}
              onHoverEnter={handleHoverEnter}
              onHoverLeave={handleHoverLeave}
            />
          ))}
          {customShapeItems.length > 0 && (
            <LibrarySection
              id="my-shapes"
              title="My Shapes"
              items={customShapeItems}
              collapsible={true}
              onClick={handleAddElement}
              onDragStart={handleDragStart}
              onDelete={handleDeleteCustom}
              isActive={isActiveTool}
              onHoverEnter={handleHoverEnter}
              onHoverLeave={handleHoverLeave}
            />
          )}
          <div className="mt-2">
            <button
              type="button"
              onClick={handleUploadClick}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded border border-dashed border-gray-300 dark:border-gray-700 hover:border-gray-400 transition-colors"
            >
              <Upload size={12} aria-hidden="true" />
              <span>Upload SVG</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/svg+xml,.svg"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload SVG shape"
            />
            {uploadError && (
              <div
                role="alert"
                className="mt-1 px-2 py-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 rounded"
              >
                {uploadError}
              </div>
            )}
          </div>
        </>
      )}
      {/* Single shared hover tooltip — see HoverTooltip below. Rendered via
          a portal so the sidebar's `overflow:hidden` doesn't clip it, and
          suppressed mid-drag so it doesn't follow the drag image. */}
      {hovered && !dragInProgress && (
        <HoverTooltip item={hovered.item} rect={hovered.rect} />
      )}
    </div>
  )
}

interface HoverTooltipProps {
  item: LibraryItem
  rect: DOMRect
}

/**
 * Floating tooltip portalled to `document.body`. Two reasons we extract
 * this rather than inline-rendering it:
 *
 *   1. The sidebar container is `overflow-hidden` — without a portal, the
 *      tooltip would clip whenever it crosses the panel edge.
 *   2. We want a triangle pointer pointing back at the source tile, which
 *      is easier to position with absolute coords against the tile's
 *      bounding rect than as a sibling inside a flex/grid layout.
 *
 * Positioning policy: prefer to sit ABOVE the tile (out of the way of
 * the cursor and the upcoming tiles below), but fall back to BELOW if
 * the tile is near the top of the viewport and there isn't room. We
 * compute this once per render — re-running on scroll would be more
 * accurate but the dwell timer is short and tooltips are torn down on
 * mouse-leave anyway, so a static placement is fine.
 */
function HoverTooltip({ item, rect }: HoverTooltipProps) {
  // Approx height: 1 line title + 1-2 lines description + 1 line hint.
  // Doesn't have to be exact — used only to choose above-vs-below.
  const APPROX_HEIGHT = 84
  const placeAbove = rect.top >= APPROX_HEIGHT + 12
  const top = placeAbove ? rect.top - APPROX_HEIGHT - 8 : rect.bottom + 8
  // Centre the tooltip horizontally over the tile, but clamp 8px from
  // the right viewport edge so it never cuts off — the sidebar is on the
  // left so we mostly worry about overrun on the right.
  const TOOLTIP_WIDTH = 220
  const desiredLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2
  const maxLeft = window.innerWidth - TOOLTIP_WIDTH - 8
  const left = Math.max(8, Math.min(desiredLeft, maxLeft))
  // Pointer triangle x-offset within the tooltip: it always points at the
  // tile's centre, regardless of the clamp above.
  const pointerX = rect.left + rect.width / 2 - left

  // Skip the fade-in for reduced-motion users — the tooltip just appears.
  // We don't subscribe to media-query changes mid-session (matches the
  // helper's documented behaviour); a refresh picks up the new setting.
  // The fade itself is a one-shot opacity transition driven by an inline
  // style flag below, so reduced-motion users see the tooltip render at
  // full opacity on first paint with no transition.
  const noMotion = prefersReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (noMotion) return
    // RAF instead of setState directly so the initial 0-opacity paint
    // commits before we flip to 1; without it React batches both styles
    // into one frame and the transition has no `from` value to interpolate.
    const r = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(r)
  }, [noMotion])
  const opacity = noMotion || mounted ? 1 : 0

  return createPortal(
    <div
      role="tooltip"
      aria-label={`${item.label} preview`}
      className="fixed z-50 max-w-[220px] px-2.5 py-2 text-xs rounded-md shadow-lg bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-900 border border-gray-700 dark:border-gray-300 pointer-events-none transition-opacity duration-150 motion-reduce:transition-none"
      style={{ top, left, width: TOOLTIP_WIDTH, opacity }}
    >
      <div className="font-medium mb-0.5">{item.label}</div>
      <div className="opacity-80 leading-snug">
        {TILE_DESCRIPTIONS[tileKey(item)] ?? `${item.category} element.`}
      </div>
      <div className="mt-1 text-[10px] opacity-60">
        Drag onto canvas, or click to add at viewport centre.
      </div>
      {/* Triangle pointer — a 1×1 rotated square sitting on the appropriate
          edge so the tooltip looks attached to the tile rather than
          floating in space. Sized at 8px diagonal which lands ~6px on
          screen after rotation. */}
      <div
        aria-hidden="true"
        className="absolute w-2 h-2 rotate-45 bg-gray-900 dark:bg-gray-100 border-gray-700 dark:border-gray-300"
        style={{
          left: Math.max(8, Math.min(pointerX - 4, TOOLTIP_WIDTH - 16)),
          ...(placeAbove
            ? { bottom: -4, borderRight: '1px solid', borderBottom: '1px solid' }
            : { top: -4, borderLeft: '1px solid', borderTop: '1px solid' }),
        }}
      />
    </div>,
    document.body,
  )
}
