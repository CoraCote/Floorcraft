/**
 * Pure per-neighborhood occupancy math.
 *
 * Takes the full element map plus the neighborhood list and produces one
 * `NeighborhoodMetric` per neighborhood — assigned seats, capacity, ratio,
 * and a health bucket. Mirrors the shape and thresholds of
 * `src/lib/utilizationMetrics.ts` so the overlay chip and the list row
 * read the same way as the project-wide KPI tile.
 *
 * Seats that live outside any neighborhood are ignored here — they're
 * already covered by the project-level occupancy widget. Same-seat
 * inclusion in more than one overlapping neighborhood is allowed on
 * purpose: two neighborhoods can share a boundary row, and both should
 * count the shared seats against their own capacity (that's how a real
 * facilities manager would read the picture).
 *
 * The `seatCount` / `assignedCount` helpers are DUPLICATED here rather
 * than imported from `utilizationMetrics.ts` so this file stays
 * self-contained — the overlay + list + analyzer all call into this
 * module and we don't want a transitive dep on the project-level KPI
 * file creeping into the Konva overlay.
 */

import type {
  CanvasElement,
  DeskElement,
  WorkstationElement,
  PrivateOfficeElement,
} from '../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isAssignableElement,
} from '../types/elements'
import type { Employee } from '../types/employee'
import type { Neighborhood } from '../types/neighborhood'
import { elementInNeighborhood } from './neighborhoodContainment'

export type NeighborhoodHealth = 'healthy' | 'warn' | 'critical' | 'unknown'

export interface NeighborhoodMetric {
  neighborhoodId: string
  name: string
  color: string
  floorId: string
  /** Sum of seat capacity across assignable elements inside the neighborhood. */
  totalSeats: number
  /** Count of employee assignments on those elements. */
  assignedSeats: number
  /** Ids of the assignable elements inside the neighborhood. Used by the
   * list row's click-to-focus wiring. */
  elementIds: string[]
  /** assignedSeats / totalSeats; 0 when totalSeats is 0. */
  occupancyRatio: number
  health: NeighborhoodHealth
}

function seatCount(
  el: DeskElement | WorkstationElement | PrivateOfficeElement,
): number {
  if (isDeskElement(el)) return el.capacity
  if (isWorkstationElement(el)) return el.positions
  return el.capacity
}

function assignedCount(
  el: DeskElement | WorkstationElement | PrivateOfficeElement,
): number {
  if (isDeskElement(el)) return el.assignedEmployeeId !== null ? 1 : 0
  // Workstation arrays are sparse (`(string|null)[]`); private offices
  // are dense (`string[]`). Filtering truthy entries handles both.
  return el.assignedEmployeeIds.filter((id) => !!id).length
}

/**
 * Bucket an occupancy ratio. Thresholds match the project-wide
 * `occupancyHealth` in `utilizationMetrics.ts` so the chip and the
 * top-level KPI tile read consistently:
 *   - unknown    when there are no seats
 *   - critical   ratio < 0.3 or > 0.95 (bone-dry or no flex)
 *   - warn       ratio < 0.6 or > 0.9
 *   - healthy    0.6 <= ratio <= 0.9
 */
export function neighborhoodOccupancyHealth(
  ratio: number,
  totalSeats: number,
): NeighborhoodHealth {
  if (totalSeats === 0) return 'unknown'
  if (ratio < 0.3 || ratio > 0.95) return 'critical'
  if (ratio < 0.6 || ratio > 0.9) return 'warn'
  return 'healthy'
}

/**
 * Compute one metric per neighborhood. `employees` is currently unused
 * by the math (assignment is read off the element itself, not the
 * employee record) but the parameter is kept so the contract matches
 * the rest of the analyzer surface and future work like "weight by
 * active status" doesn't change the signature.
 */
export function computeNeighborhoodMetrics(
  neighborhoods: Neighborhood[],
  elements: Record<string, CanvasElement>,
  _employees: Record<string, Employee>,
): NeighborhoodMetric[] {
  if (neighborhoods.length === 0) return []

  const elList = Object.values(elements)

  return neighborhoods.map((n) => {
    let totalSeats = 0
    let assignedSeats = 0
    const elementIds: string[] = []
    for (const el of elList) {
      if (!isAssignableElement(el)) continue
      if (!elementInNeighborhood(el, n)) continue
      totalSeats += seatCount(el)
      assignedSeats += assignedCount(el)
      elementIds.push(el.id)
    }
    const occupancyRatio = totalSeats > 0 ? assignedSeats / totalSeats : 0
    return {
      neighborhoodId: n.id,
      name: n.name,
      color: n.color,
      floorId: n.floorId,
      totalSeats,
      assignedSeats,
      elementIds,
      occupancyRatio,
      health: neighborhoodOccupancyHealth(occupancyRatio, totalSeats),
    }
  })
}
