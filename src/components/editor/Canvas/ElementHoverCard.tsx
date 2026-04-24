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

/**
 * Wave 10B — lightweight hover card.
 *
 * Surfaces a 1-3 line summary (type + label + assignee/capacity/length)
 * when the cursor lingers over a canvas element for ≥ 200 ms. Lives as a
 * sibling overlay of the canvas (mounted from MapView) so it can portal
 * into `document.body` and escape any clipping wrapper. Anchors to the
 * cursor in screen coordinates, flips below when above the viewport.
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

interface CardData {
  Icon: LucideIcon
  typeLabel: string
  /** Title line (label or ID). May be empty — caller renders without it. */
  primary: string
  /** Optional 2nd line (assignee / capacity / length). */
  secondary?: string
}

/**
 * Compose the card lines for a given element. Pulled out of the JSX so
 * the formatting logic is testable in isolation and the role-gating is
 * one-line obvious. Returning `null` means we have nothing useful to show
 * (e.g. an unknown element type) and the card should not render.
 */
function buildCardData(args: {
  element: ReturnType<typeof useElementsStore.getState>['elements'][string]
  employees: ReturnType<typeof useEmployeeStore.getState>['employees']
  canViewPII: boolean
  scale: number
  scaleUnit: LengthUnit
}): CardData | null {
  const { element: el, employees, canViewPII, scale, scaleUnit } = args

  if (isDeskElement(el)) {
    const assigneeId = el.assignedEmployeeId
    let secondary: string
    if (assigneeId) {
      // PII gate: share viewers + impersonated lower roles still see "Seat
      // assigned" so they know the seat is not free, but no name.
      const employee = employees[assigneeId]
      secondary = canViewPII
        ? employee?.name || 'Seat assigned'
        : 'Seat assigned'
    } else {
      secondary = canViewPII ? 'Unassigned' : 'Seat open'
    }
    return {
      Icon: Armchair,
      typeLabel: el.type === 'hot-desk' ? 'Hot desk' : 'Desk',
      primary: el.deskId || el.label,
      secondary,
    }
  }

  if (isWorkstationElement(el)) {
    return {
      Icon: Armchair,
      typeLabel: 'Workstation',
      primary: el.deskId || el.label,
      secondary: `${el.assignedEmployeeIds.length} / ${el.positions} assigned`,
    }
  }

  if (isPrivateOfficeElement(el)) {
    return {
      Icon: DoorOpen,
      typeLabel: 'Private office',
      primary: el.deskId || el.label,
      secondary: `${el.assignedEmployeeIds.length} / ${el.capacity} assigned`,
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
      Icon: Minus,
      typeLabel: 'Wall',
      primary: el.label || '',
      secondary: `${formatLength(real, scaleUnit)} ${scaleUnit}`,
    }
  }

  if (isDoorElement(el)) {
    const real = toRealLength(el.width, scale, scaleUnit)
    return {
      Icon: DoorOpen,
      typeLabel: 'Door',
      primary: el.label || '',
      secondary: `${formatLength(real, scaleUnit)} ${scaleUnit}`,
    }
  }

  if (isWindowElement(el)) {
    const real = toRealLength(el.width, scale, scaleUnit)
    return {
      Icon: AppWindow,
      typeLabel: 'Window',
      primary: el.label || '',
      secondary: `${formatLength(real, scaleUnit)} ${scaleUnit}`,
    }
  }

  if (isTableElement(el)) {
    return {
      Icon: Square,
      typeLabel: 'Table',
      primary: el.label || '',
      secondary: `${el.seatCount} seat${el.seatCount === 1 ? '' : 's'}`,
    }
  }

  if (isConferenceRoomElement(el)) {
    return {
      Icon: LayoutGrid,
      typeLabel: 'Conference room',
      primary: el.roomName || el.label || '',
      secondary: `Capacity ${el.capacity}`,
    }
  }

  if (isCommonAreaElement(el)) {
    return {
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
      canViewPII,
      scale: canvasSettings?.scale ?? 1,
      scaleUnit: canvasSettings?.scaleUnit ?? 'ft',
    })
  }, [openId, elements, employees, canViewPII, canvasSettings?.scale, canvasSettings?.scaleUnit])

  if (!openId || !coords || !card) return null
  if (typeof document === 'undefined') return null

  const reduceMotion = prefersReducedMotion()

  // `position: fixed` so we live in screen coords. The card's bottom-left
  // corner anchors above-and-right of the cursor; flip swaps to top-left
  // when the upper edge would clip.
  const top = flipped ? coords.y + CARD_OFFSET_PX : coords.y - CARD_OFFSET_PX
  const transform = flipped ? 'translate(0, 0)' : 'translate(0, -100%)'

  const { Icon, typeLabel, primary, secondary } = card

  return createPortal(
    <div
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
      className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-md px-2.5 py-1.5 text-xs max-w-[240px]"
    >
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
    </div>,
    document.body,
  )
}
