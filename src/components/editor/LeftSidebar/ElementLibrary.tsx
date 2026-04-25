import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  MessageSquarePlus,
  SearchX,
  Star,
  Upload,
  X,
} from 'lucide-react'
import { TABLE_SEAT_DEFAULTS, getDefaults } from '../../../lib/constants'
import { LibraryPreview } from './LibraryPreview'
import { useRecentLibraryItems } from '../../../hooks/useRecentLibraryItems'
import { useLibraryCollapse } from '../../../hooks/useLibraryCollapse'
import { useLibraryFavorites, favoriteKey } from '../../../hooks/useLibraryFavorites'
import { useCustomShapes } from '../../../hooks/useCustomShapes'
import { sanitizeSvg, MAX_SVG_BYTES } from '../../../lib/svgSanitize'
import {
  addRecent as persistRecent,
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
} from '../../../types/elements'
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

  // Other
  { type: 'custom-shape',      label: 'Custom Shape',    category: 'Other' },
  { type: 'text-label',        label: 'Text Label',      category: 'Other' },
]

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
    const element: WorkstationElement = {
      ...baseProps,
      type: 'workstation',
      deskId,
      positions: 4,
      assignedEmployeeIds: [],
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
        onDragStart(item)(e)
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="button"
      aria-label={`${item.label} — click to place at centre, or drag onto the canvas`}
      title="Click to add to centre, or drag onto the canvas to place exactly"
      // The wrapper owns the drag; the inner <button> handles click-to-add.
      // The star sits above as a sibling with its own keyboard handler so
      // Tab reaches it and Space/Enter toggles without placing the element.
      className={`group relative flex items-center gap-1.5 px-2 py-1.5 text-xs rounded border transition-colors cursor-grab active:cursor-grabbing hover:ring-1 hover:ring-blue-300 dark:hover:ring-blue-700 ${
        isActive
          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800'
          : 'text-gray-700 dark:text-gray-200 border-gray-100 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-200'
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

  return (
    <div className="mb-3">
      {collapsible ? (
        <button
          type="button"
          onClick={() => toggle(id)}
          className="w-full flex items-center gap-1 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mb-1"
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
          <span>{title}</span>
        </button>
      ) : (
        <div className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1 px-1">{title}</div>
      )}
      {!isCollapsed && (
        <div className="grid grid-cols-2 gap-1">
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

  const categories = useMemo(
    () => [...new Set(LIBRARY_ITEMS.map((i) => i.category))],
    [],
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
        ? [...LIBRARY_ITEMS, ...customShapeItems].filter(matchesQuery)
        : [],
    [isSearching, customShapeItems, matchesQuery],
  )
  const favoriteItems = useMemo(
    () => LIBRARY_ITEMS.filter((i) => favoriteSet.has(favoriteKey(i))),
    [favoriteSet],
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
      <input
        ref={searchInputRef}
        type="search"
        aria-label="Filter elements"
        placeholder="Search shapes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleSearchKeyDown}
        className="w-full mb-3 px-2 py-1 text-xs border border-gray-200 dark:border-gray-800 rounded focus:outline-none focus:ring-2 focus-visible:ring-2 focus:ring-blue-500 focus-visible:ring-blue-500"
      />
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
          frequently-used tiles are always one click away even mid-filter. */}
      {recents.length > 0 && (
        <LibrarySection
          id="recent"
          title="Recent"
          items={recents}
          collapsible={false}
          onClick={handleAddElement}
          onDragStart={handleDragStart}
          isActive={isActiveTool}
          onHoverEnter={handleHoverEnter}
          onHoverLeave={handleHoverLeave}
        />
      )}
      {isSearching ? (
        filtered.length === 0 ? (
          <div
            role="status"
            className="flex flex-col items-center gap-2 py-6 text-xs text-gray-500 dark:text-gray-400"
          >
            <SearchX size={20} aria-hidden="true" className="text-gray-400" />
            <div>No elements match</div>
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
            {categories.map((cat) => {
              const matched = LIBRARY_ITEMS.filter(
                (i) => i.category === cat && matchesQuery(i),
              )
              if (matched.length === 0) return null
              return (
                <LibrarySection
                  key={cat}
                  id={cat}
                  title={cat}
                  items={matched}
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
          {categories.map((cat) => (
            <LibrarySection
              key={cat}
              id={cat}
              title={cat}
              items={LIBRARY_ITEMS.filter((i) => i.category === cat)}
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
      {/* Single shared hover tooltip. Rendered as a fixed-position overlay
          so it can escape the sidebar's overflow without portalling. The
          250ms dwell threshold filters out drive-by hovers. */}
      {hovered && !dragInProgress && (
        <div
          role="tooltip"
          aria-label={`${hovered.item.label} preview`}
          className="fixed z-50 max-w-[220px] px-2.5 py-2 text-xs rounded-md shadow-lg bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-900 border border-gray-700 dark:border-gray-300 pointer-events-none"
          style={{
            // Pin to the right of the hovered tile with an 8px gap. The
            // sidebar is roughly 240px wide so this lands in canvas space
            // and never clips against the left viewport edge.
            top: hovered.rect.top,
            left: hovered.rect.right + 8,
          }}
        >
          <div className="font-medium mb-0.5">{hovered.item.label}</div>
          <div className="opacity-80 leading-snug">
            {TILE_DESCRIPTIONS[tileKey(hovered.item)] ??
              `${hovered.item.category} element.`}
          </div>
          <div className="mt-1 text-[10px] opacity-60">
            Drag onto canvas to place
          </div>
        </div>
      )}
    </div>
  )
}
