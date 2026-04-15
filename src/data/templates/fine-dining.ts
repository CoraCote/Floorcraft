import { nanoid } from 'nanoid'
import type { CanvasElement, TableElement } from '../../types/elements'
import { computeSeatPositions } from '../../lib/seatLayout'

function makeDiningTable(x: number, y: number, label: string, seats: number): TableElement {
  const isSmall = seats <= 4
  const width = isSmall ? 60 : 120
  const height = isSmall ? 60 : 60
  const type = isSmall ? 'table-round' as const : 'table-rect' as const
  const layout = isSmall ? 'around' as const : 'both-sides' as const
  return {
    id: nanoid(), type,
    x, y, width, height, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label, visible: true,
    style: { fill: '#FFFBEB', stroke: '#92400E', strokeWidth: 2, opacity: 1 },
    seatCount: seats,
    seatLayout: layout,
    seats: computeSeatPositions(type, seats, layout, width, height),
  }
}

export function createFineDiningTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []

  for (let i = 0; i < 6; i++) {
    elements.push(makeDiningTable(100 + i * 120, 100, `Table ${i + 1}`, 2))
  }

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      elements.push(makeDiningTable(130 + col * 160, 280 + row * 160, `Table ${7 + row * 4 + col}`, 4))
    }
  }

  const banquet: TableElement = {
    id: nanoid(), type: 'table-banquet',
    x: 400, y: 580, width: 200, height: 60, rotation: 0,
    locked: false, groupId: null, zIndex: 1,
    label: 'Banquet', visible: true,
    style: { fill: '#FFFBEB', stroke: '#92400E', strokeWidth: 2, opacity: 1 },
    seatCount: 12,
    seatLayout: 'both-sides',
    seats: computeSeatPositions('table-banquet', 12, 'both-sides', 200, 60),
  }
  elements.push(banquet)

  elements.push({
    id: nanoid(), type: 'bar',
    x: 750, y: 350, width: 40, height: 200, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Bar', visible: true,
    style: { fill: '#FED7AA', stroke: '#C2410C', strokeWidth: 2, opacity: 1 },
  })

  elements.push({
    id: nanoid(), type: 'reception',
    x: 100, y: 30, width: 80, height: 30, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Host', visible: true,
    style: { fill: '#D1FAE5', stroke: '#059669', strokeWidth: 2, opacity: 1 },
  })

  return elements
}
