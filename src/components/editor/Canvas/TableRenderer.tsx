import { Group, Rect, Circle, Text } from 'react-konva'
import type { TableElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { UNASSIGNED_SEAT_FILL, UNASSIGNED_SEAT_STROKE } from '../../../lib/constants'

interface TableRendererProps {
  element: TableElement
}

export function TableRenderer({ element }: TableRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  // Display-layer read — PII is redacted for viewers. Occupant labels on
  // conference/team tables should show initials, not full names.
  const employees = useVisibleEmployees()
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
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
        const employee = seat.assignedGuestId ? employees[seat.assignedGuestId] : null
        const deptColor = employee?.department ? getDepartmentColor(employee.department) : null

        return (
          <Group key={seat.id} x={seat.offsetX} y={seat.offsetY}>
            <Circle
              radius={10}
              fill={employee ? (deptColor || '#93C5FD') : UNASSIGNED_SEAT_FILL}
              stroke={employee ? (deptColor || '#3B82F6') : UNASSIGNED_SEAT_STROKE}
              strokeWidth={1.5}
              dash={employee ? undefined : [3, 3]}
            />
            {employee && (
              <Text
                text={employee.name.split(' ')[0]}
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
