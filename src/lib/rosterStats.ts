/**
 * Pure roster aggregation. Centralised here so the StatusBar (canvas
 * footer) and the RosterPage summary chip can't drift on what
 * "occupancy" means.
 *
 * Inputs are intentionally read-only — the helper does not mutate, and
 * does not depend on Zustand or any DOM/timer state. All math collapses
 * a (potentially large) employees + elements snapshot into four scalars
 * suitable for rendering above a table.
 *
 * Occupancy semantics mirror the prior inline math in `StatusBar.tsx`:
 *   - Decommissioned seats are excluded from supply (they render dimmed
 *     on the canvas but shouldn't skew utilisation).
 *   - Workstations and private offices contribute their full capacity
 *     to supply, and the count of `assignedEmployeeIds` to demand.
 *   - `0 / 0` returns `0` (rather than NaN) so callers can format the
 *     result directly as `${pct}%`.
 */
import type { Employee } from '../types/employee'
import type { CanvasElement } from '../types/elements'
import {
  isDeskElement,
  isPrivateOfficeElement,
  isWorkstationElement,
} from '../types/elements'
import { deriveSeatStatus } from './seatStatus'

export interface RosterStats {
  /** Total people in the roster, before any filter. */
  total: number
  /** People visible after applying `floorFilter` (if any). */
  visible: number
  /** Visible people without a seat — i.e. not yet placed on the floor. */
  unassigned: number
  /** 0–100 integer; assigned desks ÷ total desks (decommissioned excluded). */
  occupancyPct: number
}

/**
 * Aggregate roster counts + canvas occupancy in one pass.
 *
 * `floorFilter` is optional. When omitted (or empty string), `visible`
 * equals `total`. When set to a floor id, `visible`/`unassigned` are
 * narrowed to people whose `floorId` matches.
 *
 * `elements` is the *full* element soup across whatever floors the
 * caller cares about — the StatusBar passes the active floor, the
 * roster summary chip passes every floor's elements merged. Either is
 * fine; the helper just iterates whatever it's given.
 */
export function computeRosterStats(
  employees: readonly Employee[],
  elements: Record<string, CanvasElement>,
  floorFilter?: string,
): RosterStats {
  const total = employees.length

  let visible = total
  let unassigned = 0
  if (floorFilter) {
    visible = 0
    for (const e of employees) {
      if ((e.floorId ?? '') === floorFilter) {
        visible++
        if (!e.seatId) unassigned++
      }
    }
  } else {
    for (const e of employees) {
      if (!e.seatId) unassigned++
    }
  }

  let totalDesks = 0
  let assignedDesks = 0
  for (const el of Object.values(elements)) {
    if (deriveSeatStatus(el) === 'decommissioned') continue
    if (isDeskElement(el)) {
      totalDesks += 1
      if (el.assignedEmployeeId !== null) {
        assignedDesks += 1
      }
    } else if (isWorkstationElement(el)) {
      totalDesks += el.positions
      // Sparse positional array — count only filled slots.
      assignedDesks += el.assignedEmployeeIds.filter((id) => id !== null).length
    } else if (isPrivateOfficeElement(el)) {
      totalDesks += el.capacity
      assignedDesks += el.assignedEmployeeIds.length
    }
  }
  const occupancyPct =
    totalDesks > 0 ? Math.round((assignedDesks / totalDesks) * 100) : 0

  return { total, visible, unassigned, occupancyPct }
}
