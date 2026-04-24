import { Group, Rect, Circle, Text } from 'react-konva'
import type { TableElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { UNASSIGNED_SEAT_FILL, UNASSIGNED_SEAT_STROKE } from '../../../lib/constants'
import { truncateToWidth } from '../../../lib/textTruncate'

interface TableRendererProps {
  element: TableElement
}

// Mirror the DeskRenderer layout contract: the table label sits in a tiny
// top-left badge band, freeing the center of the table (where seats are
// positioned via `seat.offsetX/offsetY`) from overlapping text. Previously
// the label painted at y=-6 — i.e. dead center — which collided with any
// seat placed across the middle (conference/oval tables especially).
//
// Threshold below which the label badge is dropped entirely — tiny tables
// can't fit readable text without clipping, and the seats + selection
// highlight are enough wayfinding on their own. Same threshold DeskRenderer
// uses for its id badge.
const TOO_SMALL_FOR_ID = (w: number, h: number) => w < 48 || h < 28

export function TableRenderer({ element }: TableRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  // Display-layer read — PII is redacted for viewers. Occupant labels on
  // conference/team tables should show initials, not full names.
  const employees = useVisibleEmployees()
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)

  const showLabel = !TOO_SMALL_FOR_ID(element.width, element.height) && !!element.label

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

      {/* Table-label badge, anchored top-left in its own reserved band so
          it can never paint on top of a seat that lives at table-center
          (the old `y={-6}` collided with seats on conference tables). */}
      {showLabel && (
        <Text
          text={truncateToWidth(element.label, Math.max(20, element.width - 8), 9)}
          x={-element.width / 2 + 4}
          y={-element.height / 2 + 3}
          width={Math.max(20, element.width - 8)}
          align="left"
          fontSize={9}
          fontStyle="bold"
          fill="#6B7280"
          listening={false}
        />
      )}

      {element.seats.map((seat) => {
        const employee = seat.assignedGuestId ? employees[seat.assignedGuestId] : null
        const deptColor = employee?.department ? getDepartmentColor(employee.department) : null
        const firstName = employee ? employee.name.split(' ')[0] : ''
        // Pill dimensions — sized to fit a ~5-char first name at font 8.
        // Pill width is capped so very long names get truncated rather
        // than pushing the pill out past the seat cluster and overlapping
        // neighbors on tightly-packed tables.
        const PILL_W = 44
        const PILL_H = 13
        const displayName = truncateToWidth(firstName, PILL_W - 6, 8)

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
              // Rounded-pill background behind the first-name label,
              // tinted with the department color at low alpha (mirrors
              // DeskRenderer's employee-chip treatment). Keeps the name
              // readable over the canvas/table fill without a harsh
              // block of color competing with the seat circle above it.
              <Group listening={false}>
                <Rect
                  x={-PILL_W / 2}
                  y={12}
                  width={PILL_W}
                  height={PILL_H}
                  fill={deptColor || '#93C5FD'}
                  opacity={0.22}
                  cornerRadius={PILL_H / 2}
                />
                <Text
                  text={displayName}
                  x={-PILL_W / 2}
                  y={12 + (PILL_H - 8) / 2 - 1}
                  width={PILL_W}
                  align="center"
                  fontSize={8}
                  fontStyle="bold"
                  fill="#1F2937"
                />
              </Group>
            )}
          </Group>
        )
      })}
    </Group>
  )
}
