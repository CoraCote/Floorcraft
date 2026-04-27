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
  // Wave 16 — desk-id corner badge visibility. Default off so the
  // canvas reads as a glanceable plan rather than a roster table; the
  // deskId is still surfaced in the Properties panel and the hover
  // card. Toggled via View → "Show desk IDs".
  const showDeskIds: boolean =
    useCanvasStore((s) => s.settings.showDeskIds) ?? false
  // Drag-in-flight outline: when an employee is being dragged from
  // PeoplePanel, paint every assignable desk with an affordance outline
  // so the user can see where they can drop. `hoveredSeatId` bumps the
  // outline to a brighter colour on the desk currently under the cursor.
  const draggingEmployeeId = useSeatDragStore((s) => s.draggingEmployeeId)
  const hoveredSeatId = useSeatDragStore((s) => s.hoveredSeatId)
  const hoveredSlotIndex = useSeatDragStore((s) => s.hoveredSlotIndex)
  const isHovered = hoveredSeatId === element.id
  const dragState = draggingEmployeeId
    ? {
        isHovered,
        // Forwarded only to WorkstationRenderer — the value is null
        // for non-workstation hover targets, and ignored by the
        // single-seat renderers.
        hoveredSlotIndex: isHovered ? hoveredSlotIndex : null,
      }
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
        showDeskIds={showDeskIds}
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
        showDeskIds={showDeskIds}
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
      showDeskIds={showDeskIds}
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
  employees: Record<string, { id: string; name: string; department: string | null; title?: string | null; accommodations?: Accommodation[] }>
  getDepartmentColor: (department: string) => string
  /** Active while an employee drag is in flight — null otherwise. */
  dragState: { isHovered: boolean; hoveredSlotIndex: number | null } | null
  seatLabelStyle: SeatLabelStyle
  /** Wave 16 — when true, paint the desk-id corner badge. Default off
   *  so the canvas doesn't duplicate info the hover card and the
   *  Properties panel already carry. */
  showDeskIds: boolean
}

function DeskElementRenderer({ element, isSelected, employees, getDepartmentColor, dragState, seatLabelStyle, showDeskIds }: DeskElementRendererProps) {
  const employee = element.assignedEmployeeId ? employees[element.assignedEmployeeId] : null
  const departmentColor = employee?.department ? getDepartmentColor(employee.department) : null
  const isHotDesk = element.type === 'hot-desk'
  const fillColor = isHotDesk ? '#FEF9C3' : '#FEF3C7'
  const { opacityMul, overrideStroke } = seatStatusVisuals(element)
  const borderColor = isSelected
    ? '#3B82F6'
    : (overrideStroke || departmentColor || '#9CA3AF')
  const borderDash = employee ? undefined : [4, 4]

  // Wave 16 layout contract.
  //
  // The card style paints its own white body across the full seat — it
  // owns the entire interior and its 4px top accent strip is the dept
  // signal. Every other style draws on top of the desk's own fill and
  // lives inside an interior inset 4px from each edge.
  //
  // The desk-id badge is OPT-IN (default off). When on, the label
  // reserves the top `ID_BADGE_BAND_H` band so the two text layers
  // never overlap. When off, the label uses the full inset interior.
  // Either way the deskId is also surfaced in the hover card and the
  // Properties panel — hiding the corner badge does not lose the
  // information, just the on-canvas duplication.
  const TOO_SMALL_FOR_ID = element.width < 48 || element.height < 28
  const showIdBadge = showDeskIds && !TOO_SMALL_FOR_ID && seatLabelStyle !== 'card'
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

      {/* Desk-id corner badge. Wave 16: opt-in via View → "Show desk
          IDs" (default off). Hidden for the `'card'` style — its 4px
          top accent strip would clash with a 9px-tall text — and when
          the desk is too small to fit both. The deskId is also
          surfaced in the hover card and the Properties panel; the
          on-canvas badge is duplication unless the user explicitly
          turns it on. */}
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
                title: employee.title ?? null,
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
  employees: Record<string, { id: string; name: string; department: string | null; title?: string | null; accommodations?: Accommodation[] }>
  getDepartmentColor: (department: string) => string
  dragState: { isHovered: boolean; hoveredSlotIndex: number | null } | null
  seatLabelStyle: SeatLabelStyle
  showDeskIds: boolean
}

function WorkstationRenderer({ element, isSelected, employees, getDepartmentColor, dragState, seatLabelStyle, showDeskIds }: WorkstationRendererProps) {
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

      {/* Desk ID (Wave 16: opt-in via View → "Show desk IDs"). */}
      {showDeskIds && (
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
      )}

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

      {/* All-empty bench: when every slot is unoccupied, render ONE
       * unified "Available · N seats" label centred on the bench
       * instead of N individual "Open" tiles. The per-slot rendering
       * below was originally designed for the partially-filled state
       * — a row of six "Open" labels reads as "broken" rather than
       * "available," which is the actual semantic of an empty hot-desk
       * bench. The unified label restores the intended read. We keep
       * the divider lines above so the bench's "this is a multi-seat
       * surface" affordance stays. */}
      {(() => {
        const allEmpty = element.assignedEmployeeIds.every((id) => id == null)
        if (!allEmpty) return null
        // While a drag is in flight we want to surface per-slot drop
        // outlines below — letting them through the all-empty branch
        // would mean the user can't see which slot they're targeting.
        if (dragState) return null
        return (
          <>
            <Text
              text={`${element.positions}-seat shared bench`}
              x={-element.width / 2}
              y={-4}
              width={element.width}
              height={12}
              align="center"
              verticalAlign="middle"
              fontSize={10}
              fontStyle="600"
              fontFamily="Inter, system-ui, -apple-system, sans-serif"
              fill="#6B7280"
              listening={false}
            />
            <Text
              text="Available · drop a teammate to assign"
              x={-element.width / 2}
              y={8}
              width={element.width}
              height={12}
              align="center"
              verticalAlign="middle"
              fontSize={9}
              fontFamily="Inter, system-ui, -apple-system, sans-serif"
              fill="#9CA3AF"
              listening={false}
            />
          </>
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
      {/* Suppress the per-slot rendering loop when the bench is fully
       * empty and there's no active drag — the unified "Available"
       * label above replaces the row of individual "Open" tiles. The
       * loop still runs in any partial-fill state (where per-slot
       * "Open" labels are informative — they tell the user which slot
       * is free) and during a drag (where per-slot drop targets are
       * the whole point). */}
      {!(element.assignedEmployeeIds.every((id) => id == null) && !dragState) && Array.from({ length: element.positions }, (_, i) => {
        const employeeId = element.assignedEmployeeIds[i] || null
        const employee = employeeId ? employees[employeeId] : null
        const slotX = -element.width / 2 + slotWidth * i
        const deptColor = employee?.department ? getDepartmentColor(employee.department) : null
        const showDeptRail = deptColor && seatLabelStyle !== 'banner' && seatLabelStyle !== 'card'
        // Reserve 14px at the top for the deskId text (only when it's
        // shown) and 6px at the bottom for the divider/dept rail. When
        // the deskId is hidden — the Wave 16 default — the label gets
        // the reclaimed top band, which means the avatar chip and the
        // pill name actually fit at workstation slot heights.
        const topReserve = showDeskIds ? 14 : 4
        const labelTop = -element.height / 2 + topReserve
        const labelH = element.height - topReserve - 6
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
                      title: employee.title ?? null,
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
      {/* Per-slot drop affordance.
       *
       * Each slot gets its own dashed outline so the user can target a
       * SPECIFIC slot rather than the whole bench (the data model is
       * sparse-positional now — see WorkstationElement.assignedEmployeeIds).
       *
       *   - green dashed outline   → empty slot, drop will fill it
       *   - amber dashed outline   → occupied slot, drop will reassign
       *                              that slot (evicting the incumbent)
       *   - blue (thicker) outline → the slot directly under the cursor
       *
       * `dragState.hoveredSlotIndex` is null when the cursor is over a
       * different element (or over no element); in that case every slot
       * still gets the green/amber affordance so the bench reads as a
       * valid drop target overall, just without a "you are here" cue.
       */}
      {dragState && Array.from({ length: element.positions }, (_, i) => {
        const occupied = element.assignedEmployeeIds[i] != null
        const isHoveredSlot = dragState.hoveredSlotIndex === i
        const slotLeft = -element.width / 2 + slotWidth * i
        const stroke = isHoveredSlot
          ? DROP_HOVER_STROKE
          : occupied
            ? DROP_BUSY_STROKE
            : DROP_OPEN_STROKE
        // Inset by 2px so adjacent slot outlines don't visually merge,
        // and so the hovered-slot rect reads distinctly from its
        // neighbours. Listening is off — DropTargetOutline parity.
        return (
          <Rect
            key={`slot-drop-${i}`}
            x={slotLeft + 2}
            y={-element.height / 2 + 2}
            width={Math.max(0, slotWidth - 4)}
            height={Math.max(0, element.height - 4)}
            fill="transparent"
            stroke={stroke}
            strokeWidth={isHoveredSlot ? 2.5 : 1.5}
            dash={[6, 3]}
            cornerRadius={4}
            listening={false}
          />
        )
      })}
    </Group>
  )
}

// --- Private Office ---

interface PrivateOfficeRendererProps {
  element: PrivateOfficeElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null; title?: string | null; accommodations?: Accommodation[] }>
  getDepartmentColor: (department: string) => string
  dragState: { isHovered: boolean; hoveredSlotIndex: number | null } | null
  seatLabelStyle: SeatLabelStyle
  showDeskIds: boolean
}

function PrivateOfficeRenderer({ element, isSelected, employees, getDepartmentColor, dragState, seatLabelStyle, showDeskIds }: PrivateOfficeRendererProps) {
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

      {/* Desk ID (Wave 16: opt-in via View → "Show desk IDs"). */}
      {showDeskIds && (
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
      )}

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
        // Reserve a top band for the deskId text when it's shown; when
        // hidden (Wave 16 default) the label gets the reclaimed space.
        const topReserve = showDeskIds ? 14 : 6
        const labelTop = -element.height / 2 + topReserve
        const labelAreaH = element.height - topReserve - 6
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
                title: emp.title ?? null,
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
