import { TABLE_SEAT_DEFAULTS, getDefaults } from '../../../lib/constants'
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
} from '../../../types/elements'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { nanoid } from 'nanoid'
import { computeSeatPositions } from '../../../lib/seatLayout'

export interface LibraryItem {
  type: ElementType
  label: string
  category: string
  shape?: string    // NEW — optional shape override
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
    const deskId = `D-${nanoid(6)}`
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
    const deskId = `W-${nanoid(6)}`
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
    const deskId = `PO-${nanoid(6)}`
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

  // Default: generic BaseElement for chair, counter, divider, planter, custom-shape, text-label
  const element: BaseElement = {
    ...baseProps,
    type: item.type,
  }
  return element
}

export function ElementLibrary() {
  const addElement = useElementsStore((s) => s.addElement)
  const getMaxZIndex = useElementsStore((s) => s.getMaxZIndex)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const stageX = useCanvasStore((s) => s.stageX)
  const stageY = useCanvasStore((s) => s.stageY)

  const handleAddElement = (item: LibraryItem) => {
    // Click-to-add drops the element near the centre of the current
    // viewport (approx 400, 300 screen px from the canvas origin).
    const x = (-stageX + 400) / stageScale
    const y = (-stageY + 300) / stageScale
    addElement(buildLibraryElement(item, x, y, getMaxZIndex() + 1))
  }

  // Drag-to-canvas: serialise the LibraryItem into the drag payload. The
  // CanvasStage drop handler reads this, translates the drop coords into
  // canvas space, and calls buildLibraryElement at the cursor.
  const handleDragStart = (item: LibraryItem) => (e: React.DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(LIBRARY_DRAG_MIME, JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'copy'
  }

  const categories = [...new Set(LIBRARY_ITEMS.map((i) => i.category))]

  return (
    <div className="p-3 flex-1 overflow-y-auto">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Elements</div>
      {categories.map((cat) => (
        <div key={cat} className="mb-3">
          <div className="text-xs font-medium text-gray-400 mb-1">{cat}</div>
          <div className="grid grid-cols-2 gap-1">
            {LIBRARY_ITEMS.filter((i) => i.category === cat).map((item) => {
              // `getDefaults` already falls back `shape` → `type` → element
              // defaults internally, so the old `|| SHAPE_DEFAULTS[...]`
              // outer chain was dead. One call, one fallback for the swatch
              // colors if the registry somehow returns nothing.
              const d = getDefaults(item.type, item.shape)
              return (
                <button
                  key={`${item.type}${item.shape ? `-${item.shape}` : ''}-${item.label}`}
                  onClick={() => handleAddElement(item)}
                  draggable
                  onDragStart={handleDragStart(item)}
                  title={`Click to add to centre, or drag onto the canvas to place exactly`}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded border border-gray-100 hover:border-gray-200 transition-colors cursor-grab active:cursor-grabbing"
                >
                  <div
                    className="w-5 h-4 rounded-sm border flex-shrink-0"
                    style={{
                      backgroundColor: d?.fill || '#F3F4F6',
                      borderColor: d?.stroke || '#6B7280',
                    }}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
