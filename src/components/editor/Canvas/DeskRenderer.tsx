import { Group, Rect, Text, Line } from 'react-konva'
import type { DeskElement, WorkstationElement, PrivateOfficeElement } from '../../../types/elements'
import { isDeskElement, isWorkstationElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useSeatDragStore } from '../../../stores/seatDragStore'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { deriveSeatStatus } from '../../../lib/seatStatus'
import type { Accommodation } from '../../../types/employee'

/** Visual palette for the drop-target outline painted while the user is
 *  dragging an employee chip over the canvas. Green = open desk, amber =
 *  occupied (drop will reassign / swap). A separate colour for the
 *  currently-hovered desk gives a cursor-follow affordance. */
const DROP_OPEN_STROKE = '#10B981'   // emerald-500
const DROP_BUSY_STROKE = '#F59E0B'   // amber-500
const DROP_HOVER_STROKE = '#2563EB'  // blue-600

/**
 * Truncate a string so it fits a given width at the given font size.
 * Konva doesn't do CSS-style ellipsis natively; we approximate it with
 * the rough heuristic "1 char ≈ 0.55 * fontSize" so long names don't
 * bleed past the seat bounds. Not pixel-perfect, but load-bearing enough
 * to keep the overlap bug (name colliding with desk-id) fixed without
 * pulling in a canvas measurement pass on every render.
 */
function truncateToWidth(text: string, widthPx: number, fontSize: number): string {
  if (!text) return ''
  const charPx = fontSize * 0.55
  const maxChars = Math.max(1, Math.floor(widthPx / charPx))
  if (text.length <= maxChars) return text
  if (maxChars <= 1) return text[0] + '…'
  return text.slice(0, Math.max(1, maxChars - 1)) + '…'
}

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
  // Drag-in-flight outline: when an employee is being dragged from
  // PeoplePanel, paint every assignable desk with an affordance outline
  // so the user can see where they can drop. `hoveredSeatId` bumps the
  // outline to a brighter colour on the desk currently under the cursor.
  const draggingEmployeeId = useSeatDragStore((s) => s.draggingEmployeeId)
  const hoveredSeatId = useSeatDragStore((s) => s.hoveredSeatId)
  const dragState = draggingEmployeeId
    ? { isHovered: hoveredSeatId === element.id }
    : null

  if (isDeskElement(element)) {
    return (
      <DeskElementRenderer
        element={element}
        isSelected={isSelected}
        employees={employees}
        getDepartmentColor={getDepartmentColor}
        dragState={dragState}
      />
    )
  }

  if (isWorkstationElement(element)) {
    return (
      <WorkstationRenderer
        element={element}
        isSelected={isSelected}
        employees={employees}
        getDepartmentColor={getDepartmentColor}
        dragState={dragState}
      />
    )
  }

  return (
    <PrivateOfficeRenderer
      element={element as PrivateOfficeElement}
      isSelected={isSelected}
      employees={employees}
      getDepartmentColor={getDepartmentColor}
      dragState={dragState}
    />
  )
}

/**
 * Shared drop-target outline painted on top of the seat's existing border
 * while an employee drag is in progress. Colour keys off whether the seat
 * is currently occupied and whether it's the one under the cursor:
 *
 *   - hovered               → bright blue (primary affordance)
 *   - occupied (not hover)  → amber      ("will reassign / swap")
 *   - open (not hover)      → green      ("drop to assign")
 *
 * Rendered as an outline-only rect slightly outside the element so it
 * reads as an overlay rather than competing with the seat's own stroke.
 * `listening={false}` so it never swallows the drop event.
 */
function DropTargetOutline({
  width,
  height,
  isOccupied,
  isHovered,
}: {
  width: number
  height: number
  isOccupied: boolean
  isHovered: boolean
}) {
  const stroke = isHovered
    ? DROP_HOVER_STROKE
    : isOccupied
      ? DROP_BUSY_STROKE
      : DROP_OPEN_STROKE
  // Pull the outline 3 px outside the seat bounds so it doesn't collide
  // with the main body stroke. A dashed stroke reads as "drop here"
  // — solid would look like a selected state.
  return (
    <Rect
      x={-width / 2 - 3}
      y={-height / 2 - 3}
      width={width + 6}
      height={height + 6}
      fill="transparent"
      stroke={stroke}
      strokeWidth={isHovered ? 2.5 : 1.5}
      dash={[6, 3]}
      cornerRadius={6}
      listening={false}
    />
  )
}

// --- Desk / Hot-Desk ---

interface DeskElementRendererProps {
  element: DeskElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null; accommodations?: Accommodation[] }>
  getDepartmentColor: (department: string) => string
  /** Active while an employee drag is in flight — null otherwise. */
  dragState: { isHovered: boolean } | null
}

function DeskElementRenderer({ element, isSelected, employees, getDepartmentColor, dragState }: DeskElementRendererProps) {
  const employee = element.assignedEmployeeId ? employees[element.assignedEmployeeId] : null
  const departmentColor = employee?.department ? getDepartmentColor(employee.department) : null
  const isHotDesk = element.type === 'hot-desk'
  const fillColor = isHotDesk ? '#FEF9C3' : '#FEF3C7'
  const { opacityMul, overrideStroke } = seatStatusVisuals(element)
  const borderColor = isSelected
    ? '#3B82F6'
    : (overrideStroke || departmentColor || '#9CA3AF')
  const borderDash = employee ? undefined : [4, 4]

  // Layout contract: the desk-id sits as a tiny top-left badge, and the
  // employee chip lives on a pill centered on the remaining real estate
  // below it. The pill-row starts below the id-badge band (9px + 2px) so
  // the two text layers never overlap. When the seat is too narrow to
  // fit the id badge + a legible chip we drop the badge and keep only
  // the chip — the chip is the load-bearing piece for wayfinding.
  const ID_BAND_H = 11
  const TOO_SMALL_FOR_ID = element.width < 48 || element.height < 28
  const showIdBadge = !TOO_SMALL_FOR_ID
  const contentTop = showIdBadge ? -element.height / 2 + ID_BAND_H : -element.height / 2 + 4
  const contentH = element.height - (showIdBadge ? ID_BAND_H : 4) - 4
  // Employee name truncated to fit the chip width; department similarly
  // truncated at a smaller font so long dept names don't overflow.
  const chipInnerPadX = 6
  const chipW = Math.max(20, element.width - 8)
  const nameMaxPx = chipW - chipInnerPadX * 2
  const displayName = employee ? truncateToWidth(employee.name, nameMaxPx, 11) : ''
  const displayDept = employee?.department
    ? truncateToWidth(employee.department, nameMaxPx, 9)
    : ''

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

      {/* Desk-id corner badge. Rendered in its own reserved band at the
          top-left so the employee chip below can center without risking
          overlap. Hidden when the desk is too small to fit both. A
          `title`-equivalent tooltip isn't available on Konva Text but
          selection in the canvas already surfaces `element.deskId` in the
          Properties panel — same info, one click away. */}
      {showIdBadge && (
        <Text
          text={element.deskId}
          x={-element.width / 2 + 4}
          y={-element.height / 2 + 3}
          width={Math.max(20, element.width / 2 - 4)}
          align="left"
          fontSize={9}
          fontStyle="bold"
          fill="#6B7280"
          listening={false}
        />
      )}

      {employee ? (
        // Employee chip — a pill centered on the content band. The pill
        // sits behind the name so the department colour reads as a
        // gentle department tint, not a flat block. `clip` on the outer
        // Group would also work but the pill-and-truncate combo keeps
        // the chip from ever bleeding outside the seat.
        <Group clipX={-element.width / 2} clipY={contentTop} clipWidth={element.width} clipHeight={contentH}>
          {departmentColor && (
            <Rect
              x={-chipW / 2}
              y={contentTop + contentH / 2 - 10}
              width={chipW}
              height={20}
              fill={departmentColor}
              opacity={0.18}
              cornerRadius={10}
              listening={false}
            />
          )}
          <Text
            text={displayName}
            x={-chipW / 2}
            y={contentTop + contentH / 2 - 6}
            width={chipW}
            align="center"
            fontSize={11}
            fontStyle="bold"
            fill="#1F2937"
            listening={false}
          />
          {displayDept && element.height >= 44 && (
            <Text
              text={displayDept}
              x={-chipW / 2}
              y={contentTop + contentH / 2 + 7}
              width={chipW}
              align="center"
              fontSize={9}
              fill="#6B7280"
              listening={false}
            />
          )}
        </Group>
      ) : (
        <Text
          text="Open"
          x={-element.width / 2 + 4}
          y={contentTop + contentH / 2 - 6}
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
      {dragState && (
        <DropTargetOutline
          width={element.width}
          height={element.height}
          isOccupied={!!employee}
          isHovered={dragState.isHovered}
        />
      )}
    </Group>
  )
}

// --- Workstation (bench style) ---

interface WorkstationRendererProps {
  element: WorkstationElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null; accommodations?: Accommodation[] }>
  getDepartmentColor: (department: string) => string
  dragState: { isHovered: boolean } | null
}

function WorkstationRenderer({ element, isSelected, employees, getDepartmentColor, dragState }: WorkstationRendererProps) {
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
              text={
                employee
                  ? truncateToWidth(employee.name.split(' ')[0], slotWidth - 4, 10)
                  : 'Open'
              }
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
      {dragState && (
        <DropTargetOutline
          width={element.width}
          height={element.height}
          // A workstation counts as occupied if ANY position is filled —
          // dropping on it will push the employee into the next slot.
          isOccupied={element.assignedEmployeeIds.some((id) => !!id)}
          isHovered={dragState.isHovered}
        />
      )}
    </Group>
  )
}

// --- Private Office ---

interface PrivateOfficeRendererProps {
  element: PrivateOfficeElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null; accommodations?: Accommodation[] }>
  getDepartmentColor: (department: string) => string
  dragState: { isHovered: boolean } | null
}

function PrivateOfficeRenderer({ element, isSelected, employees, getDepartmentColor, dragState }: PrivateOfficeRendererProps) {
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
              text={truncateToWidth(emp.name, element.width - 16, 12)}
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
      {dragState && (
        <DropTargetOutline
          width={element.width}
          height={element.height}
          isOccupied={assignedEmployees.length > 0}
          isHovered={dragState.isHovered}
        />
      )}
    </Group>
  )
}
