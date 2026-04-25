import { Group, Rect, Text, Line } from 'react-konva'
import type { DeskElement, WorkstationElement, PrivateOfficeElement } from '../../../types/elements'
import { isDeskElement, isWorkstationElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useSeatDragStore } from '../../../stores/seatDragStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { deriveSeatStatus } from '../../../lib/seatStatus'
import type { Accommodation } from '../../../types/employee'
import type { SeatLabelStyle } from '../../../types/project'
import {
  SeatLabel,
  ID_BADGE_BAND_H,
  accommodationAnchorFor,
  type AccommodationBadgeAnchor,
} from './SeatLabel'

/** Visual palette for the drop-target outline painted while the user is
 *  dragging an employee chip over the canvas. Green = open desk, amber =
 *  occupied (drop will reassign / swap). A separate colour for the
 *  currently-hovered desk gives a cursor-follow affordance. */
const DROP_OPEN_STROKE = '#10B981'   // emerald-500
const DROP_BUSY_STROKE = '#F59E0B'   // amber-500
const DROP_HOVER_STROKE = '#2563EB'  // blue-600

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
  anchor = 'top-right',
}: {
  employee: EmployeeBadgeShape | null | undefined
  elementWidth: number
  elementHeight: number
  /** Wave 15E — `'right-below-strip'` is used for the card-style label
   *  whose 12px header strip would otherwise sit underneath the badge.
   *  Pushing the badge below the strip keeps the corner clean and the
   *  badge legible. */
  anchor?: AccommodationBadgeAnchor
}) {
  const glyph = accommodationGlyph(employee?.accommodations)
  if (!glyph) return null
  // Pixel-snapped anchor so the badge body reads crisp at every zoom.
  const cx = Math.round(elementWidth / 2 - 8)
  const cy =
    anchor === 'right-below-strip'
      ? Math.round(-elementHeight / 2 + 12 + 8)
      : Math.round(-elementHeight / 2 + 8)
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
        perfectDrawEnabled={false}
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
        perfectDrawEnabled={false}
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
  // User-selected cosmetic style for the per-seat label. Back-filled to
  // `'pill'` in ProjectShell on load, so existing projects see the
  // legacy rendering until the user opts into something else via the
  // View menu. Reading `settings.seatLabelStyle` lets every seat on
  // screen update in lockstep when the user toggles the picker.
  const seatLabelStyle: SeatLabelStyle =
    useCanvasStore((s) => s.settings.seatLabelStyle) ?? 'pill'
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
        seatLabelStyle={seatLabelStyle}
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
        seatLabelStyle={seatLabelStyle}
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
      seatLabelStyle={seatLabelStyle}
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
  seatLabelStyle: SeatLabelStyle
}

function DeskElementRenderer({ element, isSelected, employees, getDepartmentColor, dragState, seatLabelStyle }: DeskElementRendererProps) {
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
  // employee label lives on the remaining real estate below it. The
  // label-row starts below the id-badge band (9px + 2px) so the two
  // text layers never overlap. When the seat is too narrow to fit the
  // id badge + a legible label we drop the badge and keep only the
  // label — the label is the load-bearing piece for wayfinding.
  //
  // The `'card'` style is an exception: the card's own header strip
  // takes the place of the desk-id badge visually (same top-of-seat
  // real estate, same "what is this thing" signal), so we hide the
  // id-badge band and let the label consume the full height. Readers
  // can always pull the exact desk id from the Properties panel.
  // Wave 15E — pulled into a shared constant on SeatLabel so every
  // place that reasons about the id-badge keep-out band agrees.
  const TOO_SMALL_FOR_ID = element.width < 48 || element.height < 28
  const showIdBadge = !TOO_SMALL_FOR_ID && seatLabelStyle !== 'card'
  // The `'card'` style fills the entire seat — its header strip lives
  // at the top edge and the body extends to the bottom edge. Every
  // other style insets by 4px (and reserves the id-badge band at the
  // top) so the label never collides with the desk outline.
  const isCard = seatLabelStyle === 'card'
  const contentTop = isCard
    ? -element.height / 2
    : showIdBadge
      ? -element.height / 2 + ID_BADGE_BAND_H
      : -element.height / 2 + 4
  const contentH = isCard
    ? element.height
    : element.height - (showIdBadge ? ID_BADGE_BAND_H : 4) - 4
  const contentLeft = isCard ? -element.width / 2 : -element.width / 2 + 4
  const contentW = isCard ? element.width : element.width - 8

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
          top-left so the employee label below can center without risking
          overlap. Hidden for the `'card'` style (whose header strip
          replaces the badge visually) and when the desk is too small to
          fit both. A `title`-equivalent tooltip isn't available on Konva
          Text but selection in the canvas already surfaces
          `element.deskId` in the Properties panel — same info, one click
          away. */}
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

      {/* Per-seat label — one of four cosmetic styles selected from the
          canvas settings. See `SeatLabel.tsx` for the variants. The
          underlyingFill is passed so the `'card'` style can paint a
          contrasting white body over the cream desk fill. */}
      <SeatLabel
        style={seatLabelStyle}
        employee={
          employee
            ? {
                id: employee.id,
                name: employee.name,
                department: employee.department,
              }
            : null
        }
        departmentColor={departmentColor}
        x={contentLeft}
        y={contentTop}
        width={contentW}
        height={contentH}
        containerWidth={element.width}
        underlyingFill="#FFFFFF"
        attenuated={!!dragState}
      />
      <AccommodationBadge
        employee={employee}
        elementWidth={element.width}
        elementHeight={element.height}
        anchor={accommodationAnchorFor(seatLabelStyle)}
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
  seatLabelStyle: SeatLabelStyle
}

function WorkstationRenderer({ element, isSelected, employees, getDepartmentColor, dragState, seatLabelStyle }: WorkstationRendererProps) {
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
            anchor={accommodationAnchorFor(seatLabelStyle)}
          />
        )
      })()}

      {/* Position slots
       *
       * Each slot hosts one `<SeatLabel>`. The slot's usable area is the
       * per-position column between the divider lines, inset by 2px on
       * each side so the label can't kiss the divider. The bottom
       * department-colour indicator rail stays in place for every style
       * *except* `'banner'` (whose left stripe is the identity cue —
       * adding a second rail would be noise) and `'card'` (whose full-
       * bleed colour header already communicates the department).
       *
       * Layout note: workstation slots are typically narrow (40–60px
       * wide for a 4-position bench on a typical desk width), which
       * puts them below the `'avatar'` side-by-side threshold. The
       * avatar style automatically falls back to a stacked layout
       * there; no slot-layout adjustments needed.
       */}
      {Array.from({ length: element.positions }, (_, i) => {
        const employeeId = element.assignedEmployeeIds[i] || null
        const employee = employeeId ? employees[employeeId] : null
        const slotX = -element.width / 2 + slotWidth * i
        const deptColor = employee?.department ? getDepartmentColor(employee.department) : null
        const showDeptRail = deptColor && seatLabelStyle !== 'banner' && seatLabelStyle !== 'card'
        // Reserve 14px at the top for the deskId text and 6px at the
        // bottom for the divider/department rail.
        const labelTop = -element.height / 2 + 14
        const labelH = element.height - 14 - 6
        return (
          <Group key={`slot-${i}`}>
            {showDeptRail && (
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
            <SeatLabel
              style={seatLabelStyle}
              employee={
                employee
                  ? {
                      id: employee.id,
                      name: employee.name,
                      department: employee.department,
                    }
                  : null
              }
              departmentColor={deptColor}
              x={slotX + 2}
              y={labelTop}
              width={slotWidth - 4}
              height={labelH}
              containerWidth={slotWidth}
              underlyingFill="#FFFFFF"
              attenuated={!!dragState}
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
  seatLabelStyle: SeatLabelStyle
}

function PrivateOfficeRenderer({ element, isSelected, employees, getDepartmentColor, dragState, seatLabelStyle }: PrivateOfficeRendererProps) {
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

      {/* Private offices can seat 1-2 people, so we render one SeatLabel
       *  per occupant stacked vertically. Empty offices render a single
       *  `'open'`-state SeatLabel so the style choice still applies
       *  visually. The label area is inset 8px horizontally and leaves a
       *  14px top strip for the deskId text.
       *
       *  For the 2-capacity case each label gets half the interior
       *  height — that comfortably fits every style at the default
       *  private-office dimensions (100x72), though the `'avatar'`
       *  style may switch into its stacked narrow-layout variant if a
       *  user shrinks the office aggressively. */}
      {(() => {
        const labelTop = -element.height / 2 + 14
        const labelAreaH = element.height - 14 - 6
        const labelLeft = -element.width / 2 + 8
        const labelW = element.width - 16
        if (assignedEmployees.length === 0) {
          return (
            <SeatLabel
              style={seatLabelStyle}
              employee={null}
              departmentColor={null}
              x={labelLeft}
              y={labelTop}
              width={labelW}
              height={labelAreaH}
              containerWidth={element.width}
              underlyingFill="#EFF6FF"
              attenuated={!!dragState}
            />
          )
        }
        const perLabelH = labelAreaH / assignedEmployees.length
        return assignedEmployees.map((emp, i) => {
          const deptColor = emp.department ? getDepartmentColor(emp.department) : null
          return (
            <SeatLabel
              key={emp.id}
              style={seatLabelStyle}
              employee={{
                id: emp.id,
                name: emp.name,
                department: emp.department,
              }}
              departmentColor={deptColor}
              x={labelLeft}
              y={labelTop + i * perLabelH}
              width={labelW}
              height={perLabelH}
              containerWidth={element.width}
              underlyingFill="#EFF6FF"
              attenuated={!!dragState}
            />
          )
        })
      })()}
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
            anchor={accommodationAnchorFor(seatLabelStyle)}
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
