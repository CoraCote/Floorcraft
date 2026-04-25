import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Armchair,
  DoorOpen,
  Square,
  Minus,
  AppWindow,
  LayoutGrid,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useProjectStore } from '../../../stores/projectStore'
import { useCan } from '../../../hooks/useCan'
import type { LengthUnit } from '../../../lib/units'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isWallElement,
  isDoorElement,
  isWindowElement,
  isTableElement,
  isConferenceRoomElement,
  isCommonAreaElement,
} from '../../../types/elements'
import { formatLength, toRealLength } from '../../../lib/units'
import { prefersReducedMotion } from '../../../lib/prefersReducedMotion'
import { deriveSeatStatus } from '../../../lib/seatStatus'
import { ACCOMMODATION_ICONS, ACCOMMODATION_LABELS } from '../../../types/employee'
import type { Accommodation, Employee } from '../../../types/employee'

/**
 * Wave 10B — lightweight hover card.
 * Wave 16  — richer desk/workstation/office payload to carry the
 *            employee data the canvas labels deliberately stopped
 *            duplicating. The canvas now shows glanceable identity
 *            only (name + dept colour); this card carries the full
 *            picture: name, dept (with colour swatch), title, deskId,
 *            seat status, accommodations.
 *
 * Surfaces a multi-line summary when the cursor lingers over a canvas
 * element for ≥ 200 ms. Lives as a sibling overlay of the canvas
 * (mounted from MapView) so it can portal into `document.body` and
 * escape any clipping wrapper. Anchors to the cursor in screen
 * coordinates, flips below when above the viewport.
 *
 * Scope: read-only; clicking the element selects it (handled in the
 * Konva layer) which dismisses the card via the click → mouseleave
 * sequence. Suppressed in presentation mode, while a non-select/pan tool
 * is active, and during a drag (the `dragAlignmentGuides` array length
 * stands in as a "drag in progress" signal — populated only on element
 * drags).
 */

const HOVER_DELAY_MS = 200
const CARD_OFFSET_PX = 16

/**
 * Wave 16 — `CardData` is now a discriminated union. The 'summary'
 * variant carries the same primary/secondary lines as before for non-
 * seat elements (walls, doors, conference rooms, etc.). The 'seat'
 * variant carries a richer payload for desks/workstations/offices so
 * the canvas labels can stay glanceable identity only and the card
 * picks up the slack: full name, dept (with colour swatch), title,
 * deskId, status, accommodations.
 */
interface SummaryCard {
  kind: 'summary'
  Icon: LucideIcon
  typeLabel: string
  /** Title line (label or ID). May be empty — caller renders without it. */
  primary: string
  /** Optional 2nd line (assignee / capacity / length). */
  secondary?: string
}

interface SeatOccupant {
  /** When `null`, the viewer doesn't have PII access. The card falls
   *  back to "Seat assigned" / status only and never reveals the name. */
  name: string | null
  department: string | null
  /** Department colour swatch — `null` only when the employee has no
   *  department assigned (rare but valid). */
  departmentColor: string | null
  title: string | null
  status: Employee['status']
  accommodations: Accommodation[]
}

interface SeatCard {
  kind: 'seat'
  Icon: LucideIcon
  /** "Desk", "Hot desk", "Workstation", "Private office". */
  typeLabel: string
  /** Stable identifier — `deskId` if set, else the element's label. */
  deskId: string
  /** Capacity summary for multi-seat elements; undefined for single
   *  desks. e.g. "2 / 4 assigned". */
  capacityLine?: string
  /** Each occupant rendered as a row in the card body. Empty when the
   *  seat is unassigned — the card surfaces "Unassigned" / "Seat open"
   *  in the body instead. */
  occupants: SeatOccupant[]
  /** True when there is no occupant at all. Tracks separately from
   *  `occupants.length === 0` so future logic can distinguish empty-
   *  by-design (decommissioned) from empty-but-assignable. */
  isEmpty: boolean
}

type CardData = SummaryCard | SeatCard

/**
 * Compose the card lines for a given element. Pulled out of the JSX so
 * the formatting logic is testable in isolation and the role-gating is
 * one-line obvious. Returning `null` means we have nothing useful to show
 * (e.g. an unknown element type) and the card should not render.
 */
function buildCardData(args: {
  element: ReturnType<typeof useElementsStore.getState>['elements'][string]
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
  getDepartmentColor: (department: string) => string
  canViewPII: boolean
  scale: number
  scaleUnit: LengthUnit
}): CardData | null {
  const { element: el, employees, getDepartmentColor, canViewPII, scale, scaleUnit } = args

  /**
   * Build a `SeatOccupant` from an Employee record, applying the PII
   * gate. Share viewers / lower-role impersonation see "Seat assigned"
   * (no name, no title, no dept name) but still see the dept colour
   * (it's not PII) and the seat status — the same rules the canvas
   * labels use.
   */
  const occupantFor = (emp: Employee | undefined): SeatOccupant | null => {
    if (!emp) return null
    return {
      name: canViewPII ? emp.name : null,
      department: canViewPII ? emp.department : null,
      departmentColor: emp.department ? getDepartmentColor(emp.department) : null,
      title: canViewPII ? emp.title ?? null : null,
      status: emp.status,
      accommodations: canViewPII ? emp.accommodations : [],
    }
  }

  if (isDeskElement(el)) {
    const assigneeId = el.assignedEmployeeId
    const occupant = assigneeId ? occupantFor(employees[assigneeId]) : null
    return {
      kind: 'seat',
      Icon: Armchair,
      typeLabel: el.type === 'hot-desk' ? 'Hot desk' : 'Desk',
      deskId: el.deskId || el.label,
      occupants: occupant ? [occupant] : [],
      isEmpty: !occupant,
    }
  }

  if (isWorkstationElement(el)) {
    const occupants = el.assignedEmployeeIds
      .map((id) => (id ? occupantFor(employees[id]) : null))
      .filter((o): o is SeatOccupant => !!o)
    const filled = el.assignedEmployeeIds.filter((id) => !!id).length
    return {
      kind: 'seat',
      Icon: Armchair,
      typeLabel: 'Workstation',
      deskId: el.deskId || el.label,
      capacityLine: `${filled} / ${el.positions} assigned`,
      occupants,
      isEmpty: filled === 0,
    }
  }

  if (isPrivateOfficeElement(el)) {
    const occupants = el.assignedEmployeeIds
      .map((id) => occupantFor(employees[id]))
      .filter((o): o is SeatOccupant => !!o)
    return {
      kind: 'seat',
      Icon: DoorOpen,
      typeLabel: 'Private office',
      deskId: el.deskId || el.label,
      capacityLine: `${el.assignedEmployeeIds.length} / ${el.capacity} assigned`,
      occupants,
      isEmpty: el.assignedEmployeeIds.length === 0,
    }
  }

  if (isWallElement(el)) {
    // Walls store world-space `points` [x1,y1,x2,y2,...]; sum the per-segment
    // lengths so curved/multi-segment walls report total run rather than just
    // the first chord. Bulges aren't included — the hover summary is meant
    // to be glanceable, and the chord total is the value reports already use.
    const pts = el.points
    let canvasLen = 0
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const dx = pts[i + 2] - pts[i]
      const dy = pts[i + 3] - pts[i + 1]
      canvasLen += Math.sqrt(dx * dx + dy * dy)
    }
    const real = toRealLength(canvasLen, scale, scaleUnit)
    return {
      kind: 'summary',
      Icon: Minus,
      typeLabel: 'Wall',
      primary: el.label || '',
      secondary: `${formatLength(real, scaleUnit)} ${scaleUnit}`,
    }
  }

  if (isDoorElement(el)) {
    const real = toRealLength(el.width, scale, scaleUnit)
    return {
      kind: 'summary',
      Icon: DoorOpen,
      typeLabel: 'Door',
      primary: el.label || '',
      secondary: `${formatLength(real, scaleUnit)} ${scaleUnit}`,
    }
  }

  if (isWindowElement(el)) {
    const real = toRealLength(el.width, scale, scaleUnit)
    return {
      kind: 'summary',
      Icon: AppWindow,
      typeLabel: 'Window',
      primary: el.label || '',
      secondary: `${formatLength(real, scaleUnit)} ${scaleUnit}`,
    }
  }

  if (isTableElement(el)) {
    return {
      kind: 'summary',
      Icon: Square,
      typeLabel: 'Table',
      primary: el.label || '',
      secondary: `${el.seatCount} seat${el.seatCount === 1 ? '' : 's'}`,
    }
  }

  if (isConferenceRoomElement(el)) {
    return {
      kind: 'summary',
      Icon: LayoutGrid,
      typeLabel: 'Conference room',
      primary: el.roomName || el.label || '',
      secondary: `Capacity ${el.capacity}`,
    }
  }

  if (isCommonAreaElement(el)) {
    return {
      kind: 'summary',
      Icon: LayoutGrid,
      typeLabel: 'Common area',
      primary: el.areaName || el.label || '',
    }
  }

  // Generic fall-through for primitives, decor, furniture: type + label.
  // No secondary line — those elements don't carry interesting metadata
  // worth surfacing on hover.
  if (el.label) {
    return {
      kind: 'summary',
      Icon: LayoutGrid,
      typeLabel: el.type,
      primary: el.label,
    }
  }

  return null
}

export function ElementHoverCard() {
  // Drives the open/close lifecycle. We DON'T just react to `hoveredId` in
  // render — we have to debounce the open by 200ms and gate on a fresh
  // `mousemove` so the card doesn't follow stale coords.
  const hoveredId = useUIStore((s) => s.hoveredId)
  const presentationMode = useUIStore((s) => s.presentationMode)
  const dragGuidesLen = useUIStore((s) => s.dragAlignmentGuides.length)
  const activeTool = useCanvasStore((s) => s.activeTool)
  const elements = useElementsStore((s) => s.elements)
  // Raw employee map (NOT useVisibleEmployees) — we apply the PII gate
  // ourselves so a denied viewer still gets the "Seat assigned/open"
  // affordance rather than just seeing nothing.
  const employees = useEmployeeStore((s) => s.employees)
  // Wave 16 — also pull `getDepartmentColor` so the seat-card variant
  // can render a colour swatch alongside the dept name. The same util
  // the canvas labels use, so the swatch matches the on-canvas tint.
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)
  const canViewPII = useCan('viewPII')
  const canvasSettings = useProjectStore((s) => s.currentProject?.canvasSettings)

  const [openId, setOpenId] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingOpenRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Suppression: while any of these are true, the card MUST NOT be open
  // and any pending open timer MUST be cancelled. Recomputed each render.
  const suppressed =
    presentationMode ||
    dragGuidesLen > 0 ||
    (activeTool !== 'select' && activeTool !== 'pan')

  // Open/close lifecycle keyed off `hoveredId` + suppression. When a new
  // hover starts we arm a 200ms timer; if the user moves off in time we
  // cancel and the card never opens. Closing on hover-out is immediate so
  // the card doesn't linger when the operator is just passing through.
  useEffect(() => {
    if (suppressed || !hoveredId) {
      if (pendingOpenRef.current) {
        clearTimeout(pendingOpenRef.current)
        pendingOpenRef.current = null
      }
      setOpenId(null)
      return
    }
    // New hover — start the debounce. If we were already open on the
    // PREVIOUS element and user is now hovering a different one, switch
    // to that one without re-running the delay; the operator is already
    // in "card-open" mode.
    if (openId) {
      setOpenId(hoveredId)
      return
    }
    if (pendingOpenRef.current) clearTimeout(pendingOpenRef.current)
    pendingOpenRef.current = setTimeout(() => {
      // Re-check suppression at fire time — the user could have toggled
      // presentation mode or started dragging during the delay window.
      const s = useUIStore.getState()
      const c = useCanvasStore.getState()
      if (
        s.presentationMode ||
        s.dragAlignmentGuides.length > 0 ||
        (c.activeTool !== 'select' && c.activeTool !== 'pan')
      ) {
        return
      }
      // The hover may have moved off entirely while the timer was in flight.
      const currentHover = useUIStore.getState().hoveredId
      if (currentHover === hoveredId) setOpenId(hoveredId)
    }, HOVER_DELAY_MS)
    return () => {
      if (pendingOpenRef.current) {
        clearTimeout(pendingOpenRef.current)
        pendingOpenRef.current = null
      }
    }
    // We intentionally read `openId` for the fast-switch branch but don't
    // include it in the deps — adding it would re-arm the timer every
    // time the open id changes, which would then cancel itself on the
    // very next render. Reading the latest closure value is correct here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId, suppressed])

  // Track cursor position globally while a card is (or is about to be)
  // showing. rAF-throttled so a fast pointer move doesn't churn React.
  // We listen on `document` rather than the canvas wrapper because the
  // card is portalled to `document.body` and reads screen coords — the
  // wrapper's coordinate system would be a needless extra translation.
  useEffect(() => {
    if (suppressed || !hoveredId) return
    const handler = (e: MouseEvent) => {
      if (rafRef.current !== null) return
      const x = e.clientX
      const y = e.clientY
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        setCoords({ x, y })
      })
    }
    window.addEventListener('mousemove', handler)
    return () => {
      window.removeEventListener('mousemove', handler)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [hoveredId, suppressed])

  // Escape dismiss — symmetric with the rest of the editor's "Esc closes
  // the floaty thing" pattern. Stays armed only while the card is open
  // so we don't fight other Esc consumers when nothing is showing.
  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenId(null)
        useUIStore.getState().setHoveredId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  // Flip-above-when-clipped. Run after the card is mounted so we can
  // measure its actual height instead of guessing. We only flip ONCE per
  // open (by guarding on `flipped`) so a card that started below doesn't
  // ping-pong as the cursor wiggles.
  useEffect(() => {
    if (!openId || !coords || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const wouldGoAbove = coords.y - CARD_OFFSET_PX - rect.height < 0
    setFlipped(wouldGoAbove)
  }, [openId, coords])

  // Reset flip on each new open so a card opened in a flipped position
  // doesn't carry that state into a fresh open near the bottom.
  useEffect(() => {
    setFlipped(false)
  }, [openId])

  const card = useMemo<CardData | null>(() => {
    if (!openId) return null
    const el = elements[openId]
    if (!el) return null
    return buildCardData({
      element: el,
      employees,
      getDepartmentColor,
      canViewPII,
      scale: canvasSettings?.scale ?? 1,
      scaleUnit: canvasSettings?.scaleUnit ?? 'ft',
    })
  }, [openId, elements, employees, getDepartmentColor, canViewPII, canvasSettings?.scale, canvasSettings?.scaleUnit])
  // The element being hovered — used by the seat-card variant to derive
  // the on-element seat status (decommissioned/reserved) which lives on
  // the canvas element, not the assigned employee.
  const hoveredElement = openId ? elements[openId] : null

  if (!openId || !coords || !card) return null
  if (typeof document === 'undefined') return null

  const reduceMotion = prefersReducedMotion()

  // `position: fixed` so we live in screen coords. The card's bottom-left
  // corner anchors above-and-right of the cursor; flip swaps to top-left
  // when the upper edge would clip.
  const top = flipped ? coords.y + CARD_OFFSET_PX : coords.y - CARD_OFFSET_PX
  const transform = flipped ? 'translate(0, 0)' : 'translate(0, -100%)'

  return createPortal(
    <div
      ref={cardRef}
      data-testid="element-hover-card"
      role="tooltip"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: coords.x + CARD_OFFSET_PX,
        top,
        transform,
        pointerEvents: 'none',
        zIndex: 60,
        opacity: 1,
        transition: reduceMotion ? 'none' : 'opacity 120ms ease-out',
      }}
      className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-md px-2.5 py-1.5 text-xs max-w-[260px]"
    >
      {card.kind === 'summary' ? (
        <SummaryBody card={card} />
      ) : (
        <SeatBody card={card} element={hoveredElement} canViewPII={canViewPII} />
      )}
    </div>,
    document.body,
  )
}

/**
 * Renderer for the legacy two-line summary (walls, doors, conference
 * rooms, etc.). Same look as Wave 10B — type chip, primary line,
 * optional secondary.
 */
function SummaryBody({ card }: { card: SummaryCard }) {
  const { Icon, typeLabel, primary, secondary } = card
  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex-shrink-0"
          aria-hidden="true"
        >
          <Icon size={12} />
        </span>
        <span className="font-medium text-gray-700 dark:text-gray-200">
          {typeLabel}
        </span>
      </div>
      {primary ? (
        <div
          className="mt-0.5 text-gray-900 dark:text-gray-100 font-medium truncate"
          title={primary}
        >
          {primary}
        </div>
      ) : null}
      {secondary ? (
        <div className="text-gray-500 dark:text-gray-400 truncate" title={secondary}>
          {secondary}
        </div>
      ) : null}
    </>
  )
}

/**
 * Wave 16 — rich seat card. The canvas labels deliberately stopped
 * encoding department text, title, deskId, and accommodation glyphs
 * (where the hover card already had room for them). This body is the
 * surface that picks up the slack so the user never loses any data —
 * it just lives in one place per datum.
 */
function SeatBody({
  card,
  element,
  canViewPII,
}: {
  card: SeatCard
  element: ReturnType<typeof useElementsStore.getState>['elements'][string] | null
  canViewPII: boolean
}) {
  const { Icon, typeLabel, deskId, capacityLine, occupants, isEmpty } = card
  // Seat status is a property of the canvas element (decommissioned /
  // reserved overrides), not of the employee. Read it through the same
  // helper the canvas uses so the card's status badge agrees with the
  // visual treatment on the seat itself.
  const seatStatus = element ? deriveSeatStatus(element) : null
  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex-shrink-0"
          aria-hidden="true"
        >
          <Icon size={12} />
        </span>
        <span className="font-medium text-gray-700 dark:text-gray-200">
          {typeLabel}
        </span>
        <span
          className="ml-auto font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate"
          title={`Desk ID: ${deskId}`}
        >
          {deskId}
        </span>
      </div>
      {/* Capacity / status header line. Status only renders for the
          override values (decommissioned / reserved) — the default
          assigned/unassigned reads from the occupant rows below, so
          surfacing it here would duplicate the signal. */}
      {(capacityLine || (seatStatus === 'decommissioned' || seatStatus === 'reserved')) && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          {capacityLine ? <span>{capacityLine}</span> : null}
          {seatStatus === 'decommissioned' && (
            <span className="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-[10px] uppercase tracking-wide">
              Decommissioned
            </span>
          )}
          {seatStatus === 'reserved' && (
            <span className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[10px] uppercase tracking-wide">
              Reserved
            </span>
          )}
        </div>
      )}
      {isEmpty ? (
        <div className="mt-1 italic text-gray-500 dark:text-gray-400">
          {canViewPII ? 'Unassigned' : 'Seat open'}
        </div>
      ) : (
        <ul className="mt-1 space-y-1">
          {occupants.map((o, i) => (
            <OccupantRow key={i} occupant={o} canViewPII={canViewPII} />
          ))}
        </ul>
      )}
    </>
  )
}

function OccupantRow({
  occupant,
  canViewPII,
}: {
  occupant: SeatOccupant
  canViewPII: boolean
}) {
  return (
    <li className="text-[12px] leading-tight">
      <div className="flex items-center gap-1.5">
        {occupant.departmentColor ? (
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: occupant.departmentColor }}
            aria-hidden="true"
          />
        ) : (
          <span className="inline-block w-2 h-2 flex-shrink-0" aria-hidden="true" />
        )}
        <span className="text-gray-900 dark:text-gray-100 font-medium truncate">
          {occupant.name ?? 'Seat assigned'}
        </span>
        {occupant.status === 'on-leave' && (
          <span className="ml-1 px-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 text-[10px] uppercase tracking-wide">
            On leave
          </span>
        )}
        {occupant.status === 'departed' && (
          <span className="ml-1 px-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-[10px] uppercase tracking-wide">
            Departed
          </span>
        )}
      </div>
      {/* Department + title line. Department NAME (text) is the canonical
          textual encoding of department now — the canvas labels stopped
          rendering it. PII gate hides the dept name AND title for share
          viewers; the dot swatch above still shows the colour because
          colour isn't PII. */}
      {canViewPII && (occupant.department || occupant.title) ? (
        <div className="ml-3.5 text-gray-500 dark:text-gray-400 truncate">
          {[occupant.title, occupant.department].filter(Boolean).join(' · ')}
        </div>
      ) : null}
      {occupant.accommodations.length > 0 ? (
        <div className="ml-3.5 mt-0.5 flex flex-wrap gap-1">
          {occupant.accommodations.map((a) => (
            <AccommodationChip key={a.id} accommodation={a} />
          ))}
        </div>
      ) : null}
    </li>
  )
}

function AccommodationChip({ accommodation }: { accommodation: Accommodation }) {
  const Icon = ACCOMMODATION_ICONS[accommodation.type]
  const label = ACCOMMODATION_LABELS[accommodation.type]
  return (
    <span
      className="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[10px]"
      title={accommodation.notes ? `${label} — ${accommodation.notes}` : label}
    >
      <Icon size={10} />
      {label}
    </span>
  )
}
