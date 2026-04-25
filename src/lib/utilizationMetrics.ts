/**
 * Facilities-focused utilization math. All pure functions — the Insights
 * Panel widget calls them once per render and they must never touch stores
 * or perform I/O.
 *
 * Metrics surfaced (and why each one earns its keep):
 *   - occupancyRatio: the single KPI every facilities manager checks first.
 *     "Are the seats we have actually being used?"
 *   - seatsPerPerson: inverts occupancy to answer "do we have excess?".
 *     An under-1 ratio means we've overcommitted headcount to seats.
 *   - meetingRoomRatio: cross-check against headcount. Rule of thumb in
 *     open offices is ~1 meeting seat per 4-6 employees. Lets HR/facilities
 *     spot the "we never have rooms available" pattern before the
 *     complaints start.
 *   - phoneBoothRatio: distinct from meeting rooms because 1:1s and
 *     hybrid-call needs are modelled differently in most real offices.
 *   - commonAreaCount: signal for "are we a heads-down office or a
 *     collaboration office?" — no bright line, but a zero here on a
 *     100-person floor is a red flag.
 */

import type { CanvasElement, DeskElement, WorkstationElement, PrivateOfficeElement } from '../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isConferenceRoomElement,
  isCommonAreaElement,
} from '../types/elements'
import type { Employee } from '../types/employee'
import type { Floor } from '../types/floor'

export interface UtilizationMetrics {
  /** Total seat capacity across desks + workstations + private offices. */
  totalSeats: number
  /** Seats with at least one assigned employee. */
  assignedSeats: number
  /** Fraction of seats assigned. 0 when totalSeats == 0. */
  occupancyRatio: number
  /** Total active employees (status !== 'departed'). */
  activeEmployees: number
  /** totalSeats / activeEmployees; 0 when activeEmployees == 0. */
  seatsPerPerson: number
  /** Sum of `capacity` across conference-room elements. */
  meetingRoomSeats: number
  /** Count of phone-booth elements. */
  phoneBooths: number
  /** meetingRoomSeats / activeEmployees; 0 when activeEmployees == 0. */
  meetingSeatsPerPerson: number
  /** phoneBooths / activeEmployees; 0 when activeEmployees == 0. */
  phoneBoothsPerPerson: number
  /** Count of common-area elements (kitchens/lounges/etc). */
  commonAreas: number
}

const EMPTY_METRICS: UtilizationMetrics = {
  totalSeats: 0,
  assignedSeats: 0,
  occupancyRatio: 0,
  activeEmployees: 0,
  seatsPerPerson: 0,
  meetingRoomSeats: 0,
  phoneBooths: 0,
  meetingSeatsPerPerson: 0,
  phoneBoothsPerPerson: 0,
  commonAreas: 0,
}

/**
 * A seat is one of the three assignable element types. Private offices
 * report full capacity even when only one person sits in them (the space
 * is allocated either way, which is what facilities cares about).
 */
function seatCount(el: DeskElement | WorkstationElement | PrivateOfficeElement): number {
  if (isDeskElement(el)) return el.capacity
  if (isWorkstationElement(el)) return el.positions
  return el.capacity
}

function assignedCount(el: DeskElement | WorkstationElement | PrivateOfficeElement): number {
  if (isDeskElement(el)) return el.assignedEmployeeId !== null ? 1 : 0
  // Workstation arrays are sparse; private offices dense. Filter
  // truthy entries so both shapes report occupancy correctly.
  return el.assignedEmployeeIds.filter((id) => !!id).length
}

export function computeUtilizationMetrics(
  elements: Record<string, CanvasElement>,
  employees: Record<string, Employee>,
): UtilizationMetrics {
  // Guard against callers handing us raw empty state early in the render.
  const elList = Object.values(elements)
  const empList = Object.values(employees)
  if (elList.length === 0 && empList.length === 0) return EMPTY_METRICS

  let totalSeats = 0
  let assignedSeats = 0
  let meetingRoomSeats = 0
  let phoneBooths = 0
  let commonAreas = 0

  for (const el of elList) {
    if (isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el)) {
      totalSeats += seatCount(el)
      assignedSeats += assignedCount(el)
      continue
    }
    if (isConferenceRoomElement(el)) {
      meetingRoomSeats += el.capacity
      continue
    }
    if (el.type === 'phone-booth') {
      phoneBooths += 1
      continue
    }
    if (isCommonAreaElement(el)) {
      commonAreas += 1
    }
  }

  // Active = not departed. `status` may legitimately be undefined in older
  // payloads; the autosave migration back-fills to 'active', but belt-and-
  // suspenders it here too so we never under-count on a fresh cold load.
  let activeEmployees = 0
  for (const e of empList) {
    if (e.status !== 'departed') activeEmployees += 1
  }

  const occupancyRatio = totalSeats > 0 ? assignedSeats / totalSeats : 0
  const seatsPerPerson = activeEmployees > 0 ? totalSeats / activeEmployees : 0
  const meetingSeatsPerPerson =
    activeEmployees > 0 ? meetingRoomSeats / activeEmployees : 0
  const phoneBoothsPerPerson =
    activeEmployees > 0 ? phoneBooths / activeEmployees : 0

  return {
    totalSeats,
    assignedSeats,
    occupancyRatio,
    activeEmployees,
    seatsPerPerson,
    meetingRoomSeats,
    phoneBooths,
    meetingSeatsPerPerson,
    phoneBoothsPerPerson,
    commonAreas,
  }
}

/**
 * Per-floor breakdown of utilization metrics. The single-floor reducer
 * (`computeUtilizationMetrics`) merges every element regardless of floor,
 * which is the right answer for the "overall insights" panel but is useless
 * when a manager asks "which of my 6 floors is overcrowded?". This helper
 * runs the same reducer once per floor so the Floor Compare report can
 * render one row per floor.
 *
 * Inputs:
 *   - `floors` — the source of truth for which elements belong to which
 *     floor. Each `Floor.elements` is the authoritative per-floor element
 *     map; the returned object has exactly one entry per floor in `floors`.
 *   - `elements` — a flat element map used to OVERRIDE the per-floor snapshot
 *     for elements that are currently live on the active canvas (i.e., the
 *     editor hasn't flushed them back into `floor.elements` yet). Any element
 *     id in this map that appears in some `floor.elements` replaces the
 *     stored version. Elements in this map that don't match any floor are
 *     excluded — we have no way to attribute them.
 *   - `employees` — headcount/status is a global signal, so every floor gets
 *     the same `activeEmployees` denominator. This matches how facilities
 *     managers think: "5 floors, 200 people across all of them".
 *
 * Pure: no store access, no date calls.
 */
export function computeUtilizationMetricsByFloor(
  floors: Floor[],
  elements: Record<string, CanvasElement>,
  employees: Record<string, Employee>,
): Record<string, UtilizationMetrics> {
  const out: Record<string, UtilizationMetrics> = {}

  // Build a reverse index: which floor does each element id belong to?
  // Walk floors once so an element present in two floor snapshots resolves
  // to whichever floor was iterated last — in practice every element lives
  // on exactly one floor, but we guard anyway.
  const floorIdByElementId = new Map<string, string>()
  for (const floor of floors) {
    for (const id of Object.keys(floor.elements)) {
      floorIdByElementId.set(id, floor.id)
    }
  }

  for (const floor of floors) {
    // Start from the stored snapshot. For the active floor, any live
    // element in `elements` whose id matches an element in this floor
    // replaces the stored copy. We ONLY honour ids that the reverse index
    // resolves to this floor — an element with a missing floorId (i.e.
    // not in any floor.elements) is excluded.
    const merged: Record<string, CanvasElement> = { ...floor.elements }
    for (const [id, live] of Object.entries(elements)) {
      if (floorIdByElementId.get(id) === floor.id) {
        merged[id] = live
      }
    }
    out[floor.id] = computeUtilizationMetrics(merged, employees)
  }

  return out
}

/**
 * Bucket a ratio against a healthy range for display. "healthy" styles the
 * widget green; "warn" yellow; "critical" red. Used so the KPI tiles flag
 * genuine problems rather than just reporting numbers.
 *
 * Thresholds chosen from common facilities-management rules of thumb — they
 * aren't hard science, but they're the ranges most references cite:
 *   - occupancy 60-90% healthy (below = underused, above = no flex)
 *   - meeting seats per person 0.1-0.25 healthy
 *   - phone booths per person 0.02-0.08 healthy
 */
export type MetricHealth = 'healthy' | 'warn' | 'critical' | 'unknown'

export function occupancyHealth(ratio: number, totalSeats: number): MetricHealth {
  if (totalSeats === 0) return 'unknown'
  if (ratio < 0.3 || ratio > 0.95) return 'critical'
  if (ratio < 0.6 || ratio > 0.9) return 'warn'
  return 'healthy'
}

export function meetingSeatsHealth(ratio: number, activeEmployees: number): MetricHealth {
  if (activeEmployees === 0) return 'unknown'
  if (ratio < 0.05) return 'critical'
  if (ratio < 0.1 || ratio > 0.35) return 'warn'
  return 'healthy'
}

export function phoneBoothHealth(ratio: number, activeEmployees: number): MetricHealth {
  if (activeEmployees === 0) return 'unknown'
  if (ratio < 0.01) return 'critical'
  if (ratio < 0.02) return 'warn'
  return 'healthy'
}
