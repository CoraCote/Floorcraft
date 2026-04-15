import { nanoid } from 'nanoid'
import type { CanvasElement, TableElement } from '../../types/elements'
import { computeSeatPositions } from '../../lib/seatLayout'

export function createCorporateBoardroomTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []

  const confTable: TableElement = {
    id: nanoid(), type: 'table-conference',
    x: 400, y: 300, width: 240, height: 80, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Conference Table', visible: true,
    style: { fill: '#F3F4F6', stroke: '#6B7280', strokeWidth: 2, opacity: 1 },
    seatCount: 14,
    seatLayout: 'around',
    seats: computeSeatPositions('table-conference', 14, 'around', 240, 80),
  }
  elements.push(confTable)

  elements.push({
    id: nanoid(), type: 'podium',
    x: 400, y: 120, width: 36, height: 36, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Podium', visible: true,
    style: { fill: '#E0E7FF', stroke: '#4F46E5', strokeWidth: 2, opacity: 1 },
  })

  elements.push({
    id: nanoid(), type: 'custom-shape',
    x: 400, y: 60, width: 200, height: 20, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Screen', visible: true,
    style: { fill: '#1F2937', stroke: '#111827', strokeWidth: 2, opacity: 1 },
  })

  return elements
}
