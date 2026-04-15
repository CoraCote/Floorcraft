import { nanoid } from 'nanoid'
import type { CanvasElement, TableElement } from '../../types/elements'
import { computeSeatPositions } from '../../lib/seatLayout'

function makeTable(
  x: number, y: number, label: string,
  type: 'table-round' | 'table-rect' = 'table-round',
  seatCount = 8
): TableElement {
  const width = type === 'table-round' ? 80 : 120
  const height = type === 'table-round' ? 80 : 60
  const layout = type === 'table-round' ? 'around' as const : 'both-sides' as const
  return {
    id: nanoid(),
    type,
    x, y,
    width, height,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label,
    visible: true,
    style: { fill: '#F3F4F6', stroke: '#6B7280', strokeWidth: 2, opacity: 1 },
    seatCount,
    seatLayout: layout,
    seats: computeSeatPositions(type, seatCount, layout, width, height),
  }
}

export function createWeddingReceptionTemplate(): CanvasElement[] {
  const elements: CanvasElement[] = []

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      elements.push(makeTable(150 + col * 160, 200 + row * 200, `Table ${row * 5 + col + 1}`))
    }
  }

  elements.push(makeTable(470, 50, 'Head Table', 'table-rect', 12))

  elements.push({
    id: nanoid(), type: 'dance-floor',
    x: 470, y: 550, width: 200, height: 200, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Dance Floor', visible: true,
    style: { fill: '#EDE9FE', stroke: '#7C3AED', strokeWidth: 2, opacity: 1 },
  })

  elements.push({
    id: nanoid(), type: 'stage',
    x: 470, y: 700, width: 240, height: 80, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Stage', visible: true,
    style: { fill: '#FEE2E2', stroke: '#B91C1C', strokeWidth: 2, opacity: 1 },
  })

  elements.push({
    id: nanoid(), type: 'bar',
    x: 850, y: 400, width: 40, height: 160, rotation: 0,
    locked: false, groupId: null, zIndex: 0,
    label: 'Bar', visible: true,
    style: { fill: '#FED7AA', stroke: '#C2410C', strokeWidth: 2, opacity: 1 },
  })

  return elements
}
