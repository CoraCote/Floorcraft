import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Star, Upload, X } from 'lucide-react'
import { TABLE_SEAT_DEFAULTS, getDefaults } from '../../../lib/constants'
import { LibraryPreview } from './LibraryPreview'
import { useRecentLibraryItems } from '../../../hooks/useRecentLibraryItems'
import { useLibraryCollapse } from '../../../hooks/useLibraryCollapse'
import { useLibraryFavorites, favoriteKey } from '../../../hooks/useLibraryFavorites'
import { useCustomShapes } from '../../../hooks/useCustomShapes'
import { sanitizeSvg, MAX_SVG_BYTES } from '../../../lib/svgSanitize'
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
import { useCanEdit } from '../../../hooks/useCanEdit'
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
}

function LibraryTile({ item, onClick, onDragStart, onDelete }: LibraryTileProps) {
  const isFavorite = useLibraryFavorites((s) => s.favorites.has(favoriteKey(item)))
  const toggleFavorite = useLibraryFavorites((s) => s.toggleFavorite)

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

  return (
    <div
      draggable
      onDragStart={onDragStart(item)}
      title="Click to add to centre, or drag onto the canvas to place exactly"
      // The wrapper owns the drag; the inner <button> handles click-to-add.
      // The star sits above as a sibling with its own keyboard handler so
      // Tab reaches it and Space/Enter toggles without placing the element.
      className="group relative flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded border border-gray-100 hover:border-gray-200 transition-colors cursor-grab active:cursor-grabbing"
    >
      <button
        type="button"
        onClick={() => onClick(item)}
        className="flex items-center gap-1.5 flex-1 text-left"
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
          className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-red-400 hover:bg-red-50"
        >
          <X size={12} className="text-gray-400 hover:text-red-500" />
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
            className={isFavorite ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}
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
}

function LibrarySection({
  id, title, items, collapsible = true, onClick, onDragStart, onDelete,
}: LibrarySectionProps) {
  const collapsed = useLibraryCollapse((s) => s.collapsed[id] ?? false)
  const toggle = useLibraryCollapse((s) => s.toggleCategory)
  const isCollapsed = collapsible && collapsed

  if (items.length === 0) return null

  return (
    <div className="mb-3">
      {collapsible ? (
        <button
          type="button"
          onClick={() => toggle(id)}
          className="w-full flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 mb-1"
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span>{title}</span>
        </button>
      ) : (
        <div className="text-xs font-medium text-gray-400 mb-1 px-1">{title}</div>
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
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ElementLibrary() {
  const canEdit = useCanEdit()
  const addElement = useElementsStore((s) => s.addElement)
  const getMaxZIndex = useElementsStore((s) => s.getMaxZIndex)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const stageX = useCanvasStore((s) => s.stageX)
  const stageY = useCanvasStore((s) => s.stageY)
  const recents = useRecentLibraryItems((s) => s.recents)
  const addRecent = useRecentLibraryItems((s) => s.addRecent)
  const favoriteSet = useLibraryFavorites((s) => s.favorites)
  const customShapes = useCustomShapes((s) => s.shapes)
  const addCustomShape = useCustomShapes((s) => s.addShape)
  const removeCustomShape = useCustomShapes((s) => s.removeShape)
  const [query, setQuery] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    const x = (-stageX + 400) / stageScale
    const y = (-stageY + 300) / stageScale
    // Read elements via getState() so we don't re-subscribe the component
    // to the whole map just to auto-number a new seat.
    const existing = useElementsStore.getState().elements
    addElement(buildLibraryElement(item, x, y, getMaxZIndex() + 1, existing))
    addRecent(item)
  }

  // Drag-to-canvas: serialise the LibraryItem into the drag payload. The
  // CanvasStage drop handler reads this, translates the drop coords into
  // canvas space, and calls buildLibraryElement at the cursor.
  const handleDragStart = (item: LibraryItem) => (e: React.DragEvent<HTMLElement>) => {
    e.dataTransfer.setData(LIBRARY_DRAG_MIME, JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'copy'
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
  const filtered = useMemo(
    () =>
      isSearching
        ? [...LIBRARY_ITEMS, ...customShapeItems].filter((i) =>
            i.label.toLowerCase().includes(q),
          )
        : [],
    [isSearching, q, customShapeItems],
  )
  const favoriteItems = useMemo(
    () => LIBRARY_ITEMS.filter((i) => favoriteSet.has(favoriteKey(i))),
    [favoriteSet],
  )

  // Viewers can't place anything — the library is inert for them. Hiding
  // the entire tile grid (instead of disabling each tile) keeps the UI
  // honest: a panel that looks interactive but silently ignores clicks is
  // worse than an obvious view-only placard.
  if (!canEdit) {
    return (
      <div className="p-4 text-xs text-gray-500 space-y-1">
        <div className="font-medium text-gray-600">View-only</div>
        <div>You don't have permission to add elements to this office.</div>
      </div>
    )
  }

  return (
    <div className="p-3 flex-1 overflow-y-auto">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Elements</div>
      <input
        type="search"
        placeholder="Search shapes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full mb-3 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      {isSearching ? (
        <LibrarySection
          id="search-results"
          title={`Results (${filtered.length})`}
          items={filtered}
          collapsible={false}
          onClick={handleAddElement}
          onDragStart={handleDragStart}
        />
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
            />
          )}
          {recents.length > 0 && (
            <LibrarySection
              id="recent"
              title="Recent"
              items={recents}
              collapsible={false}
              onClick={handleAddElement}
              onDragStart={handleDragStart}
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
            />
          )}
          <div className="mt-2">
            <button
              type="button"
              onClick={handleUploadClick}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded border border-dashed border-gray-300 hover:border-gray-400 transition-colors"
            >
              <Upload size={12} />
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
                className="mt-1 px-2 py-1 text-xs text-red-600 bg-red-50 border border-red-100 rounded"
              >
                {uploadError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
