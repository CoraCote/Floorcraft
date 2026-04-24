import { Group, Rect, Text, Line } from 'react-konva'
import type { DeskElement, WorkstationElement, PrivateOfficeElement } from '../../../types/elements'
import { isDeskElement, isWorkstationElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { deriveSeatStatus } from '../../../lib/seatStatus'
import type { Accommodation } from '../../../types/employee'

/**
 * Minimum shape needed to render a seat badge — we deliberately don't
 * require the full `Employee` record here so the (narrow) typings the
 * sub-renderers receive can extend this instead of pulling in
 * `accommodations: undefined` everywhere. If the employee lookup comes
 * up empty or the array is missing, we render nothing.
 */
interface EmployeeBadgeShape {
  accommodations?: Accommodation[]
}

/**
 * Unicode-glyph badge keyed off the employee's accommodations. We pick
 * a single representative glyph per seat (wheelchair trumps everything
 * — it's the ADA-load-bearing one), so a user glancing at the layout
 * can pick out accommodated seats without reading labels.
 *
 * Using Text + a Konva Circle was the deliberate trade vs. wiring the
 * lucide SVG paths into react-konva — the glyph set renders reliably
 * across platforms and stays small (12px) without import gymnastics.
 */
function accommodationGlyph(
  accommodations: Accommodation[] | undefined,
): string | null {
  if (!accommodations || accommodations.length === 0) return null
  if (accommodations.some((a) => a.type === 'wheelchair-access')) return '\u267F' // ♿
  const first = accommodations[0]
  switch (first.type) {
    case 'quiet-zone':
      return '\u{1F910}' // 🤐
    case 'proximity-to-exit':
      return '\u{1F6AA}' // 🚪
    case 'ergonomic-chair':
      return '\u{1FA91}' // 🪑
    case 'standing-desk':
      return '\u{1F5A5}' // 🖥
    case 'natural-light':
      return '\u2600' // ☀
    default:
      return '\u2726' // ✦
  }
}

/**
 * Render a small top-right corner badge on assignable seats when the
 * assigned employee has at least one accommodation. Non-interactive —
 * `listening={false}` so it never intercepts clicks / drags.
 */
function AccommodationBadge({
  employee,
  elementWidth,
  elementHeight,
}: {
  employee: EmployeeBadgeShape | null | undefined
  elementWidth: number
  elementHeight: number
}) {
  const glyph = accommodationGlyph(employee?.accommodations)
  if (!glyph) return null
  // Anchor in the top-right corner (x/y are element-relative since the
  // parent Group is already translated to the element origin).
  const cx = elementWidth / 2 - 8
  const cy = -elementHeight / 2 + 8
  return (
    <Group listening={false}>
      <Rect
        x={cx - 7}
        y={cy - 7}
        width={14}
        height={14}
        cornerRadius={7}
        fill="#4F46E5" /* indigo-600 */
        opacity={0.95}
      />
      <Text
        text={glyph}
        x={cx - 7}
        y={cy - 7}
        width={14}
        height={14}
        align="center"
        verticalAlign="middle"
        fontSize={10}
        fill="#ffffff"
      />
    </Group>
  )
}

/** Visual tweaks driven off the derived seat status — kept here so each
 *  sub-renderer reads the same source of truth and the policy lives in one
 *  place ("decommissioned = 40% opacity; reserved = orange outline"). */
const RESERVED_STROKE = '#F59E0B' // amber-500
function seatStatusVisuals(el: DeskElement | WorkstationElement | PrivateOfficeElement) {
  const status = deriveSeatStatus(el)
  return {
    opacityMul: status === 'decommissioned' ? 0.4 : 1,
    overrideStroke: status === 'reserved' ? RESERVED_STROKE : null,
  }
}

interface DeskRendererProps {
  element: DeskElement | WorkstationElement | PrivateOfficeElement
}

export function DeskRenderer({ element }: DeskRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  // Seat labels go through `useVisibleEmployees` so viewers without PII
  // access see initials on the map, not full names. Department colour
  // remains visible — it's not PII and it's load-bearing for wayfinding.
  const employees = useVisibleEmployees()
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)

  if (isDeskElement(element)) {
    return <DeskElementRenderer element={element} isSelected={isSelected} employees={employees} getDepartmentColor={getDepartmentColor} />
  }

  if (isWorkstationElement(element)) {
    return <WorkstationRenderer element={element} isSelected={isSelected} employees={employees} getDepartmentColor={getDepartmentColor} />
  }

  return <PrivateOfficeRenderer element={element as PrivateOfficeElement} isSelected={isSelected} employees={employees} getDepartmentColor={getDepartmentColor} />
}

// --- Desk / Hot-Desk ---

interface DeskElementRendererProps {
  element: DeskElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null; accommodations?: Accommodation[] }>
  getDepartmentColor: (department: string) => string
}

function DeskElementRenderer({ element, isSelected, employees, getDepartmentColor }: DeskElementRendererProps) {
  const employee = element.assignedEmployeeId ? employees[element.assignedEmployeeId] : null
  const departmentColor = employee?.department ? getDepartmentColor(employee.department) : null
  const isHotDesk = element.type === 'hot-desk'
  const fillColor = isHotDesk ? '#FEF9C3' : '#FEF3C7'
  const { opacityMul, overrideStroke } = seatStatusVisuals(element)
  const borderColor = isSelected
    ? '#3B82F6'
    : (overrideStroke || departmentColor || '#9CA3AF')
  const borderDash = employee ? undefined : [4, 4]

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill={fillColor}
        stroke={borderColor}
        strokeWidth={isSelected ? 2.5 : overrideStroke ? 2.5 : 1.5}
        cornerRadius={4}
        dash={borderDash}
        opacity={element.style.opacity * opacityMul}
      />

      {/* Desk ID */}
      <Text
        text={element.deskId}
        x={-element.width / 2 + 4}
        y={-element.height / 2 + 3}
        width={element.width - 8}
        align="left"
        fontSize={9}
        fill="#9CA3AF"
        listening={false}
      />

      {employee ? (
        <>
          {/* Employee name */}
          <Text
            text={employee.name}
            x={-element.width / 2 + 4}
            y={-5}
            width={element.width - 8}
            align="center"
            fontSize={11}
            fontStyle="bold"
            fill="#1F2937"
            listening={false}
          />
          {/* Department */}
          <Text
            text={employee.department || ''}
            x={-element.width / 2 + 4}
            y={8}
            width={element.width - 8}
            align="center"
            fontSize={9}
            fill="#6B7280"
            listening={false}
          />
        </>
      ) : (
        <Text
          text="Open"
          x={-element.width / 2 + 4}
          y={-4}
          width={element.width - 8}
          align="center"
          fontSize={11}
          fontStyle="italic"
          fill="#9CA3AF"
          listening={false}
        />
      )}
      <AccommodationBadge
        employee={employee}
        elementWidth={element.width}
        elementHeight={element.height}
      />
    </Group>
  )
}

// --- Workstation (bench style) ---

interface WorkstationRendererProps {
  element: WorkstationElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null; accommodations?: Accommodation[] }>
  getDepartmentColor: (department: string) => string
}

function WorkstationRenderer({ element, isSelected, employees, getDepartmentColor }: WorkstationRendererProps) {
  const slotWidth = element.width / element.positions
  const { opacityMul, overrideStroke } = seatStatusVisuals(element)
  const borderColor = isSelected
    ? '#3B82F6'
    : (overrideStroke || element.style.stroke)

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill={element.style.fill}
        stroke={borderColor}
        strokeWidth={isSelected ? 2.5 : overrideStroke ? 2.5 : element.style.strokeWidth}
        cornerRadius={4}
        opacity={element.style.opacity * opacityMul}
      />

      {/* Desk ID */}
      <Text
        text={element.deskId}
        x={-element.width / 2 + 4}
        y={-element.height / 2 + 3}
        width={element.width - 8}
        align="left"
        fontSize={9}
        fill="#9CA3AF"
        listening={false}
      />

      {/* Divider lines between positions */}
      {Array.from({ length: element.positions - 1 }, (_, i) => {
        const lineX = -element.width / 2 + slotWidth * (i + 1)
        return (
          <Line
            key={`divider-${i}`}
            points={[lineX, -element.height / 2 + 14, lineX, element.height / 2 - 4]}
            stroke="#D1D5DB"
            strokeWidth={1}
            listening={false}
          />
        )
      })}

      {(() => {
        // A workstation holds multiple people; surface the first assignee
        // with any accommodation so the badge still functions as a "this
        // row has accommodations" cue. Wheelchair priority is handled
        // inside `accommodationGlyph`.
        const accommodated = element.assignedEmployeeIds
          .map((id) => (id ? employees[id] : null))
          .find((e) => e && e.accommodations && e.accommodations.length > 0)
        if (!accommodated) return null
        return (
          <AccommodationBadge
            employee={accommodated}
            elementWidth={element.width}
            elementHeight={element.height}
          />
        )
      })()}

      {/* Position slots */}
      {Array.from({ length: element.positions }, (_, i) => {
        const employeeId = element.assignedEmployeeIds[i] || null
        const employee = employeeId ? employees[employeeId] : null
        const slotX = -element.width / 2 + slotWidth * i
        const deptColor = employee?.department ? getDepartmentColor(employee.department) : null

        return (
          <Group key={`slot-${i}`}>
            {/* Department color indicator dot */}
            {deptColor && (
              <Rect
                x={slotX + 2}
                y={element.height / 2 - 5}
                width={slotWidth - 4}
                height={2}
                fill={deptColor}
                cornerRadius={1}
                listening={false}
              />
            )}
            <Text
              text={employee ? employee.name.split(' ')[0] : 'Open'}
              x={slotX}
              y={-2}
              width={slotWidth}
              align="center"
              fontSize={10}
              fontStyle={employee ? 'normal' : 'italic'}
              fill={employee ? '#1F2937' : '#9CA3AF'}
              listening={false}
            />
          </Group>
        )
      })}
    </Group>
  )
}

// --- Private Office ---

interface PrivateOfficeRendererProps {
  element: PrivateOfficeElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null; accommodations?: Accommodation[] }>
  getDepartmentColor: (department: string) => string
}

function PrivateOfficeRenderer({ element, isSelected, employees, getDepartmentColor }: PrivateOfficeRendererProps) {
  const assignedEmployees = element.assignedEmployeeIds
    .map((id) => employees[id])
    .filter(Boolean)
  const borderColor = isSelected ? '#3B82F6' : element.style.stroke
  const firstDeptColor = assignedEmployees[0]?.department
    ? getDepartmentColor(assignedEmployees[0].department)
    : null
  const { opacityMul, overrideStroke } = seatStatusVisuals(element)

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill="#EFF6FF"
        stroke={
          isSelected
            ? '#3B82F6'
            : (overrideStroke || firstDeptColor || borderColor)
        }
        strokeWidth={isSelected ? 3 : 2}
        cornerRadius={6}
        opacity={element.style.opacity * opacityMul}
      />

      {/* Desk ID */}
      <Text
        text={element.deskId}
        x={-element.width / 2 + 4}
        y={-element.height / 2 + 4}
        width={element.width - 8}
        align="left"
        fontSize={9}
        fill="#9CA3AF"
        listening={false}
      />

      {assignedEmployees.length > 0 ? (
        <>
          {assignedEmployees.map((emp, i) => (
            <Text
              key={emp.id}
              text={emp.name}
              x={-element.width / 2 + 8}
              y={-8 + i * 16}
              width={element.width - 16}
              align="center"
              fontSize={12}
              fontStyle="bold"
              fill="#1E3A5F"
              listening={false}
            />
          ))}
        </>
      ) : (
        <Text
          text="Open"
          x={-element.width / 2 + 8}
          y={-4}
          width={element.width - 16}
          align="center"
          fontSize={12}
          fontStyle="italic"
          fill="#9CA3AF"
          listening={false}
        />
      )}
      {(() => {
        const accommodated = assignedEmployees.find(
          (e) => e?.accommodations && e.accommodations.length > 0,
        )
        if (!accommodated) return null
        return (
          <AccommodationBadge
            employee={accommodated}
            elementWidth={element.width}
            elementHeight={element.height}
          />
        )
      })()}
    </Group>
  )
}
