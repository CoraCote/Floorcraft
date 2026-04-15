import { ELEMENT_DEFAULTS, TABLE_SEAT_DEFAULTS } from '../../../lib/constants'
import type { ElementType, TableType } from '../../../types/elements'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { nanoid } from 'nanoid'
import { computeSeatPositions } from '../../../lib/seatLayout'
import type { TableElement, BaseElement } from '../../../types/elements'

interface LibraryItem {
  type: ElementType
  label: string
  category: string
}

const LIBRARY_ITEMS: LibraryItem[] = [
  { type: 'table-round', label: 'Round Table', category: 'Tables' },
  { type: 'table-rect', label: 'Rectangular Table', category: 'Tables' },
  { type: 'table-banquet', label: 'Banquet Table', category: 'Tables' },
  { type: 'table-conference', label: 'Conference Table', category: 'Tables' },
  { type: 'chair', label: 'Chair', category: 'Seating' },
  { type: 'sofa', label: 'Sofa', category: 'Seating' },
  { type: 'stool', label: 'Stool', category: 'Seating' },
  { type: 'desk', label: 'Desk', category: 'Work' },
  { type: 'counter', label: 'Counter', category: 'Work' },
  { type: 'podium', label: 'Podium', category: 'Work' },
  { type: 'lectern', label: 'Lectern', category: 'Work' },
  { type: 'stage', label: 'Stage', category: 'Venue' },
  { type: 'bar', label: 'Bar', category: 'Venue' },
  { type: 'reception', label: 'Reception Desk', category: 'Venue' },
  { type: 'dance-floor', label: 'Dance Floor', category: 'Venue' },
  { type: 'custom-shape', label: 'Custom Shape', category: 'Zones' },
  { type: 'divider', label: 'Divider', category: 'Zones' },
  { type: 'planter', label: 'Planter', category: 'Zones' },
]

function isTableType(type: ElementType): type is TableType {
  return type === 'table-round' || type === 'table-rect' || type === 'table-banquet' || type === 'table-conference'
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

    if (isTableType(item.type)) {
      const seatCount = TABLE_SEAT_DEFAULTS[item.type] || 6
      const layout = item.type === 'table-round' ? 'around' as const
        : item.type === 'table-banquet' ? 'both-sides' as const
        : item.type === 'table-conference' ? 'around' as const
        : 'both-sides' as const

      const element: TableElement = {
        id,
        type: item.type,
        x, y,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        locked: false,
        groupId: null,
        zIndex: getMaxZIndex() + 1,
        label: item.label,
        visible: true,
        style: { fill: defaults.fill, stroke: defaults.stroke, strokeWidth: 2, opacity: 1 },
        seatCount,
        seatLayout: layout,
        seats: computeSeatPositions(item.type, seatCount, layout, defaults.width, defaults.height),
      }
      addElement(element)
    } else {
      const element: BaseElement = {
        id,
        type: item.type,
        x, y,
        width: defaults.width,
        height: defaults.height,
        rotation: 0,
        locked: false,
        groupId: null,
        zIndex: getMaxZIndex() + 1,
        label: item.label,
        visible: true,
        style: { fill: defaults.fill, stroke: defaults.stroke, strokeWidth: 2, opacity: 1 },
      }
      addElement(element)
    }
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
