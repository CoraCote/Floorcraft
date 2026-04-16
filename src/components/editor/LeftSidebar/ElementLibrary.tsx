import { ELEMENT_DEFAULTS, TABLE_SEAT_DEFAULTS } from '../../../lib/constants'
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
} from '../../../types/elements'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { nanoid } from 'nanoid'
import { computeSeatPositions } from '../../../lib/seatLayout'

interface LibraryItem {
  type: ElementType
  label: string
  category: string
}

const LIBRARY_ITEMS: LibraryItem[] = [
  // Workspaces
  { type: 'desk', label: 'Desk', category: 'Workspaces' },
  { type: 'hot-desk', label: 'Hot Desk', category: 'Workspaces' },
  { type: 'workstation', label: 'Workstation', category: 'Workspaces' },
  { type: 'private-office', label: 'Private Office', category: 'Workspaces' },
  // Rooms
  { type: 'conference-room', label: 'Conference Room', category: 'Rooms' },
  { type: 'phone-booth', label: 'Phone Booth', category: 'Rooms' },
  { type: 'common-area', label: 'Common Area', category: 'Rooms' },
  // Structure
  { type: 'divider', label: 'Divider', category: 'Structure' },
  { type: 'planter', label: 'Planter', category: 'Structure' },
  // Other
  { type: 'chair', label: 'Chair', category: 'Other' },
  { type: 'counter', label: 'Counter', category: 'Other' },
  { type: 'table-rect', label: 'Table', category: 'Other' },
  { type: 'table-conference', label: 'Conference Table', category: 'Other' },
  { type: 'custom-shape', label: 'Custom Shape', category: 'Other' },
  { type: 'text-label', label: 'Text Label', category: 'Other' },
]

function isTableType(type: ElementType): type is TableType {
  return type === 'table-rect' || type === 'table-conference'
}

export function ElementLibrary() {
  const addElement = useElementsStore((s) => s.addElement)
  const getMaxZIndex = useElementsStore((s) => s.getMaxZIndex)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const stageX = useCanvasStore((s) => s.stageX)
  const stageY = useCanvasStore((s) => s.stageY)

  const handleAddElement = (item: LibraryItem) => {
    const defaults = ELEMENT_DEFAULTS[item.type] || { width: 60, height: 60, fill: '#F3F4F6', stroke: '#6B7280' }
    const id = nanoid()

    const x = (-stageX + 400) / stageScale
    const y = (-stageY + 300) / stageScale

    const baseProps = {
      id,
      x,
      y,
      width: defaults.width,
      height: defaults.height,
      rotation: 0,
      locked: false,
      groupId: null,
      zIndex: getMaxZIndex() + 1,
      label: item.label,
      visible: true,
      style: { fill: defaults.fill, stroke: defaults.stroke, strokeWidth: 2, opacity: 1 },
    } as const

    if (isTableType(item.type)) {
      const seatCount = TABLE_SEAT_DEFAULTS[item.type] || 6
      const layout = item.type === 'table-conference' ? 'around' as const : 'both-sides' as const

      const element: TableElement = {
        ...baseProps,
        type: item.type,
        seatCount,
        seatLayout: layout,
        seats: computeSeatPositions(item.type, seatCount, layout, defaults.width, defaults.height),
      }
      addElement(element)
      return
    }

    if (item.type === 'desk' || item.type === 'hot-desk') {
      const deskId = `D-${nanoid(6)}`
      const element: DeskElement = {
        ...baseProps,
        type: item.type,
        deskId,
        assignedEmployeeId: null,
        capacity: 1,
      }
      addElement(element)
      return
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
      addElement(element)
      return
    }

    if (item.type === 'private-office') {
      const deskId = `PO-${nanoid(6)}`
      const element: PrivateOfficeElement = {
        ...baseProps,
        type: 'private-office',
        deskId,
        capacity: 1,
        assignedEmployeeIds: [],
      }
      addElement(element)
      return
    }

    if (item.type === 'conference-room') {
      const element: ConferenceRoomElement = {
        ...baseProps,
        type: 'conference-room',
        roomName: 'Conference Room',
        capacity: 8,
      }
      addElement(element)
      return
    }

    if (item.type === 'phone-booth') {
      const element: PhoneBoothElement = {
        ...baseProps,
        type: 'phone-booth',
      }
      addElement(element)
      return
    }

    if (item.type === 'common-area') {
      const element: CommonAreaElement = {
        ...baseProps,
        type: 'common-area',
        areaName: 'Common Area',
      }
      addElement(element)
      return
    }

    // Default: generic BaseElement for chair, counter, divider, planter, custom-shape, text-label
    const element: BaseElement = {
      ...baseProps,
      type: item.type,
    }
    addElement(element)
  }

  const categories = [...new Set(LIBRARY_ITEMS.map((i) => i.category))]

  return (
    <div className="p-3 flex-1 overflow-y-auto">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Elements</div>
      {categories.map((cat) => (
        <div key={cat} className="mb-3">
          <div className="text-xs font-medium text-gray-400 mb-1">{cat}</div>
          <div className="grid grid-cols-2 gap-1">
            {LIBRARY_ITEMS.filter((i) => i.category === cat).map((item) => (
              <button
                key={item.type}
                onClick={() => handleAddElement(item)}
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <div
                  className="w-5 h-4 rounded-sm border flex-shrink-0"
                  style={{
                    backgroundColor: ELEMENT_DEFAULTS[item.type]?.fill || '#F3F4F6',
                    borderColor: ELEMENT_DEFAULTS[item.type]?.stroke || '#6B7280',
                  }}
                />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
