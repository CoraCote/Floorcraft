import { Group, Rect, Circle, Ellipse, Text } from 'react-konva'
import type { TableElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { useSeatingStore } from '../../../stores/seatingStore'
import { UNASSIGNED_SEAT_FILL, UNASSIGNED_SEAT_STROKE } from '../../../lib/constants'

interface TableRendererProps {
  element: TableElement
}

export function TableRenderer({ element }: TableRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const guests = useSeatingStore((s) => s.guests)
  const getGroupColor = useSeatingStore((s) => s.getGroupColor)

  const isRound = element.type === 'table-round'

  return (
    <Group x={element.x} y={element.y} rotation={element.rotation} listening={!element.locked}>
      {isRound ? (
        <Ellipse
          radiusX={element.width / 2}
          radiusY={element.height / 2}
          fill={element.style.fill}
          stroke={isSelected ? '#3B82F6' : element.style.stroke}
          strokeWidth={isSelected ? 2.5 : element.style.strokeWidth}
        />
      ) : (
        <Rect
          x={-element.width / 2}
          y={-element.height / 2}
          width={element.width}
          height={element.height}
          fill={element.style.fill}
          stroke={isSelected ? '#3B82F6' : element.style.stroke}
          strokeWidth={isSelected ? 2.5 : element.style.strokeWidth}
          cornerRadius={4}
        />
      )}

      <Text
        text={element.label}
        x={-element.width / 2}
        y={-6}
        width={element.width}
        align="center"
        fontSize={11}
        fill="#6B7280"
        listening={false}
      />

      {element.seats.map((seat) => {
        const guest = seat.assignedGuestId ? guests[seat.assignedGuestId] : null
        const groupColor = guest?.groupName ? getGroupColor(guest.groupName) : null

        return (
          <Group key={seat.id} x={seat.offsetX} y={seat.offsetY}>
            <Circle
              radius={10}
              fill={guest ? (groupColor || '#93C5FD') : UNASSIGNED_SEAT_FILL}
              stroke={guest ? (groupColor || '#3B82F6') : UNASSIGNED_SEAT_STROKE}
              strokeWidth={1.5}
              dash={guest ? undefined : [3, 3]}
            />
            {guest && (
              <Text
                text={guest.name.split(' ')[0]}
                x={-20}
                y={12}
                width={40}
                align="center"
                fontSize={8}
                fill="#374151"
                listening={false}
              />
            )}
          </Group>
        )
      })}
    </Group>
  )
}
