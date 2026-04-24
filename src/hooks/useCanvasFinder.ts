import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useCanvasFinderStore, type FinderMatch } from '../stores/canvasFinderStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useNeighborhoodStore } from '../stores/neighborhoodStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useCan } from './useCan'
import { focusOnElement } from '../lib/canvasFocus'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isConferenceRoomElement,
  isCommonAreaElement,
  isTableElement,
  isWallElement,
  type CanvasElement,
} from '../types/elements'

/**
 * Builds the live match list for the canvas finder, drives focus-on-cycle,
 * and watches for floor/route changes that should auto-close the finder.
 *
 * Designed to be called once near the canvas root (inside `<CanvasFinder>`).
 * The hook owns the side effects so the renderer/dimming subscription can
 * stay a pure read of the store.
 *
 * Search semantics (active floor only):
 *
 *   - Desks / workstations / private offices: match `deskId` and (when the
 *     viewer has `viewPII`) the assigned employee's name.
 *   - Conference rooms: `roomName` and `label`.
 *   - Common areas: `areaName` and `label`.
 *   - Tables / walls: `label` only.
 *   - Neighborhoods: `name`.
 *   - Employees: `name`, plus `email` and `title` when viewPII is granted.
 *     Only employees whose `seatId` resolves to an element on the active
 *     floor surface as matches — without an anchor we'd have nothing to
 *     focus on.
 *
 * Empty / whitespace-only query → `matches: []` (which the renderer reads
 * to mean "do not dim anything").
 */
export function useCanvasFinder() {
  const open = useCanvasFinderStore((s) => s.open)
  const query = useCanvasFinderStore((s) => s.query)
  const activeIndex = useCanvasFinderStore((s) => s.activeIndex)
  const setMatches = useCanvasFinderStore((s) => s.setMatches)
  const reset = useCanvasFinderStore((s) => s.reset)

  const elements = useElementsStore((s) => s.elements)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const neighborhoods = useNeighborhoodStore((s) => s.neighborhoods)
  // Employees come from the raw store (not redacted). Redaction is applied
  // per-field below based on `useCan('viewPII')` so we only search the
  // fields the viewer is allowed to see — searching the raw record lets a
  // privileged viewer match on email even if the display layer has a
  // separate redacted copy.
  const employees = useEmployeeStore((s) => s.employees)
  const canViewPII = useCan('viewPII')

  const location = useLocation()

  // Compute matches. The query is normalised once (trimmed, lowercased)
  // and substring-tested against the candidate fields. `useMemo` keeps the
  // computation off the render path when only the active index changes.
  const matches = useMemo<FinderMatch[]>(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    if (q.length === 0) return []

    const out: FinderMatch[] = []
    const elementValues = Object.values(elements)
    const elementIdSet = new Set(elementValues.map((el) => el.id))

    // --- Elements on the active floor --------------------------------------
    for (const el of elementValues) {
      const matched = matchElement(el, q, employees, canViewPII)
      if (matched) {
        out.push({
          kind: 'element',
          id: el.id,
          anchorId: el.id,
          label: matched,
        })
      }
    }

    // --- Neighborhoods on the active floor --------------------------------
    for (const n of Object.values(neighborhoods)) {
      if (n.floorId !== activeFloorId) continue
      if (n.name.toLowerCase().includes(q)) {
        out.push({
          kind: 'neighborhood',
          id: n.id,
          anchorId: n.id,
          label: n.name,
        })
      }
    }

    // --- Employees seated on the active floor -----------------------------
    for (const emp of Object.values(employees)) {
      if (emp.floorId !== activeFloorId) continue
      if (!emp.seatId || !elementIdSet.has(emp.seatId)) continue
      // Name is always searchable. Email/title gated by viewPII so an
      // unprivileged viewer can't probe for PII via the finder.
      const nameHit = emp.name.toLowerCase().includes(q)
      const emailHit =
        canViewPII && emp.email ? emp.email.toLowerCase().includes(q) : false
      const titleHit =
        canViewPII && emp.title ? emp.title.toLowerCase().includes(q) : false
      if (nameHit || emailHit || titleHit) {
        out.push({
          kind: 'employee',
          id: emp.id,
          anchorId: emp.seatId,
          label: emp.name,
        })
      }
    }

    return out
  }, [open, query, elements, neighborhoods, employees, activeFloorId, canViewPII])

  // Push the computed matches into the store so the renderer-side
  // dimming subscription and the UI's match counter stay in lock-step.
  useEffect(() => {
    setMatches(matches)
  }, [matches, setMatches])

  // Pan to the active match when it changes. Skipped when the finder is
  // closed or no matches exist. Reads element rect from the live elements
  // map so a freshly-edited size still centers correctly.
  useEffect(() => {
    if (!open) return
    const list = useCanvasFinderStore.getState().matches
    if (list.length === 0) return
    const m = list[activeIndex]
    if (!m) return
    const el = useElementsStore.getState().elements[m.anchorId]
    if (el) {
      focusOnElement(
        { x: el.x, y: el.y, width: el.width, height: el.height },
        m.anchorId,
      )
    }
    // matches.length changes when the user types — that's a signal to
    // re-focus the (possibly new) first match. activeIndex captures
    // user-driven cycling.
  }, [open, activeIndex, matches.length])

  // Auto-close when the active floor changes. The finder's match list is
  // pinned to the active floor; surviving the swap would leave stale
  // anchors. Reset on route change for the same reason.
  useEffect(() => {
    return () => {
      // No-op on initial mount; the cleanup runs when activeFloorId / path
      // changes. The reset is safe to call when already closed.
      reset()
    }
  }, [activeFloorId, location.pathname, reset])
}

/**
 * Try to match an element against the lowercased query. Returns the
 * matched display label (used by the finder UI), or `null` when nothing
 * hit. Matches are checked in order of "most specific" first so the
 * surfaced label tells the user *why* the element matched.
 */
function matchElement(
  el: CanvasElement,
  q: string,
  employees: Record<string, { id: string; name: string; email: string; title: string | null }>,
  canViewPII: boolean,
): string | null {
  // Walls — label only. The default for newly-drawn walls is empty so
  // the substring branch handles "no label" as a non-match naturally.
  if (isWallElement(el)) {
    if (el.label && el.label.toLowerCase().includes(q)) return el.label
    return null
  }

  // Conference rooms search both `roomName` (the canonical title) and
  // the generic `label` (for legacy data that had no roomName).
  if (isConferenceRoomElement(el)) {
    if (el.roomName && el.roomName.toLowerCase().includes(q)) return el.roomName
    if (el.label && el.label.toLowerCase().includes(q)) return el.label
    return null
  }

  if (isCommonAreaElement(el)) {
    if (el.areaName && el.areaName.toLowerCase().includes(q)) return el.areaName
    if (el.label && el.label.toLowerCase().includes(q)) return el.label
    return null
  }

  // Assignable seats — match deskId AND (when viewPII granted) the
  // assigned employee's display name. Workstations/private offices can
  // hold multiple assignments; any one matching is enough.
  if (isDeskElement(el)) {
    if (el.deskId && el.deskId.toLowerCase().includes(q)) return el.deskId
    if (canViewPII && el.assignedEmployeeId) {
      const emp = employees[el.assignedEmployeeId]
      if (emp && emp.name.toLowerCase().includes(q)) return emp.name
    }
    if (el.label && el.label.toLowerCase().includes(q)) return el.label
    return null
  }

  if (isWorkstationElement(el)) {
    if (el.deskId && el.deskId.toLowerCase().includes(q)) return el.deskId
    if (canViewPII) {
      for (const empId of el.assignedEmployeeIds) {
        const emp = employees[empId]
        if (emp && emp.name.toLowerCase().includes(q)) return emp.name
      }
    }
    if (el.label && el.label.toLowerCase().includes(q)) return el.label
    return null
  }

  if (isPrivateOfficeElement(el)) {
    if (el.deskId && el.deskId.toLowerCase().includes(q)) return el.deskId
    if (canViewPII) {
      for (const empId of el.assignedEmployeeIds) {
        const emp = employees[empId]
        if (emp && emp.name.toLowerCase().includes(q)) return emp.name
      }
    }
    if (el.label && el.label.toLowerCase().includes(q)) return el.label
    return null
  }

  // Tables — name-only via the generic `label`; the seats themselves
  // aren't individually addressable in the finder.
  if (isTableElement(el)) {
    if (el.label && el.label.toLowerCase().includes(q)) return el.label
    return null
  }

  // Everything else (decor, primitives, free-text, etc.) — match the
  // generic label only. Empty labels short-circuit harmlessly.
  if (el.label && el.label.toLowerCase().includes(q)) return el.label
  return null
}
