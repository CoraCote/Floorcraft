/**
 * Pure aggregation for the ReportsPage stat strip.
 *
 * Wave 13C added a 4–6 card KPI strip to the top of Reports. The numbers
 * come from the same stores the rest of the app reads (employees, floors,
 * elements, dept colors), but the strip wants a *different* slice than
 * `rosterStats` exposes — notably:
 *
 *   - "Total seats" needs *all* capacity (desks + workstation positions +
 *     private-office capacity), not just decommission-filtered desks.
 *     Reports surfaces raw capacity because a decommissioned seat is still
 *     real real-estate the facilities team paid for.
 *   - "Floors" is a trivial count but we centralise it here so future
 *     stats (e.g. per-floor averages) compose against the same input.
 *   - "Departments" counts distinct department *names* present in the
 *     roster (after trimming / dropping empty). The dept color map may
 *     include historical entries, so we derive from the live roster
 *     instead.
 *
 * Re-uses `computeRosterStats` for the occupancy/unassigned math so the
 * strip can't drift from the StatusBar footer on what "occupied" means.
 */
import type { Employee } from '../types/employee'
import type { CanvasElement } from '../types/elements'
import {
  isDeskElement,
  isPrivateOfficeElement,
  isWorkstationElement,
} from '../types/elements'
import { computeRosterStats } from './rosterStats'

export interface ReportsStats {
  /** All employees in the roster. */
  totalEmployees: number
  /** Employees without a `seatId` (regardless of status). */
  unassigned: number
  /** Sum of desk + workstation capacity + private-office capacity, across every floor. */
  totalSeats: number
  /** 0–100 integer. `assignedDesks / totalDesks` per rosterStats. */
  occupancyPct: number
  /** Number of floors in the project. */
  floorCount: number
  /** Distinct non-empty department names from the roster. */
  departmentCount: number
}

/**
 * Compose a ReportsStats from the pieces the stores already hand us.
 *
 * `elementsByFloor` is the shape `useAllFloorElements()` returns — one
 * entry per floor with the live element map. We iterate every floor so
 * "total seats" and "occupancy" consider the whole project, not just the
 * active floor.
 */
export function computeReportsStats(
  employees: Record<string, Employee>,
  elementsByFloor: Array<{ floorId: string; elements: Record<string, CanvasElement> }>,
): ReportsStats {
  const employeeList = Object.values(employees)

  // Merge every floor's elements into one map so computeRosterStats sees
  // project-wide supply and demand. The key collision risk is zero because
  // element ids are globally unique (nanoid).
  const allElements: Record<string, CanvasElement> = {}
  for (const floor of elementsByFloor) {
    for (const [id, el] of Object.entries(floor.elements)) {
      allElements[id] = el
    }
  }
  const roster = computeRosterStats(employeeList, allElements)

  // Total seats (capacity) — we count every assignable seat including
  // decommissioned ones. Reports is about real-estate totals, not live
  // utilisation; the occupancy % (above) already excludes decommissioned.
  let totalSeats = 0
  for (const el of Object.values(allElements)) {
    if (isDeskElement(el)) {
      totalSeats += 1
    } else if (isWorkstationElement(el)) {
      totalSeats += el.positions
    } else if (isPrivateOfficeElement(el)) {
      totalSeats += el.capacity
    }
  }

  const depts = new Set<string>()
  for (const e of employeeList) {
    const name = e.department?.trim()
    if (name) depts.add(name)
  }

  return {
    totalEmployees: roster.total,
    unassigned: roster.unassigned,
    totalSeats,
    occupancyPct: roster.occupancyPct,
    floorCount: elementsByFloor.length,
    departmentCount: depts.size,
  }
}
