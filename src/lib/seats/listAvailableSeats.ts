import type { CanvasElement } from '../../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
} from '../../types/elements'
import type { Floor } from '../../types/floor'
import type { Employee } from '../../types/employee'
import type { Neighborhood } from '../../types/neighborhood'

/**
 * Flat option row the in-roster seat picker consumes. One entry per
 * assignable *element*, not per slot — workstations are still a single
 * option that hands their slot resolution off to `assignEmployee` (which
 * already has the "first empty slot" fallback).
 */
export interface SeatOption {
  /** Element id — pass to `assignEmployee` as `targetElementId`. */
  elementId: string
  /** Floor id — pass to `assignEmployee` as `floorId`. */
  floorId: string
  /** Floor display name, used in the option's secondary line. */
  floorName: string
  /**
   * User-facing seat label. Prefers a non-empty `element.label` (the
   * nickname users set in the Properties panel — e.g. "Sara's old
   * corner desk") over the auto-derived `element.deskId` ("D-101").
   * Falls back to deskId when no label override exists. Field name
   * stays `deskId` for caller stability.
   */
  deskId: string
  /** Element subtype — drives the icon/badge in the picker UI. */
  type: 'desk' | 'hot-desk' | 'workstation' | 'private-office'
  /** Total slots this element has (1 for desks, N for workstations). */
  capacity: number
  /** Currently filled slots. `capacity - occupied = free`. */
  occupied: number
  /**
   * Names of currently-seated occupants, in slot order for workstations
   * and a single-element list for 1:1 desks. Used both to render
   * the "currently: X" label and to decide whether picking this option
   * triggers an eviction.
   */
  occupantNames: string[]
  /** Neighborhood name if this seat sits inside one, else null. */
  neighborhoodName: string | null
}

/**
 * Walk every floor and produce one `SeatOption` per assignable element
 * (desks, workstations, private offices). The picker uses this as its
 * raw dataset and filters/sorts in-component.
 *
 * Workstations report total `capacity = positions` and `occupied = #
 * non-null slots` so the picker can show "3 / 4 free" without the caller
 * needing to know about the sparse-array shape. `assignEmployee` itself
 * handles slot resolution — the first-empty-slot fallback is good
 * enough for v1, matching the existing canvas-drop behavior.
 *
 * Sorting is left to the caller; this is a pure mapping. Returns a fresh
 * array each call so the result is safe to pass into `useMemo` keyed on
 * floor + element identity.
 */
export function listAvailableSeats(
  floors: Floor[],
  employees: Record<string, Employee>,
  neighborhoods: Record<string, Neighborhood> = {},
): SeatOption[] {
  const out: SeatOption[] = []
  for (const floor of floors) {
    const floorNeighborhoods = Object.values(neighborhoods).filter(
      (n) => n.floorId === floor.id,
    )
    for (const el of Object.values(floor.elements)) {
      const opt = toSeatOption(el, floor.id, floor.name, employees, floorNeighborhoods)
      if (opt) out.push(opt)
    }
  }
  return out
}

function toSeatOption(
  el: CanvasElement,
  floorId: string,
  floorName: string,
  employees: Record<string, Employee>,
  neighborhoods: Neighborhood[],
): SeatOption | null {
  const neighborhoodName = findEnclosingNeighborhood(el, neighborhoods)
  const labelOverride = el.label?.trim() || null

  if (isDeskElement(el)) {
    const occName = el.assignedEmployeeId ? nameOf(employees, el.assignedEmployeeId) : null
    return {
      elementId: el.id,
      floorId,
      floorName,
      deskId: labelOverride || el.deskId || '(unnamed seat)',
      type: el.type,
      capacity: 1,
      occupied: el.assignedEmployeeId ? 1 : 0,
      occupantNames: occName ? [occName] : [],
      neighborhoodName,
    }
  }
  if (isWorkstationElement(el)) {
    const filled = el.assignedEmployeeIds.filter((x): x is string => Boolean(x))
    return {
      elementId: el.id,
      floorId,
      floorName,
      deskId: labelOverride || el.deskId || '(unnamed bench)',
      type: 'workstation',
      capacity: el.positions,
      occupied: filled.length,
      occupantNames: filled.map((id) => nameOf(employees, id) ?? '—'),
      neighborhoodName,
    }
  }
  if (isPrivateOfficeElement(el)) {
    return {
      elementId: el.id,
      floorId,
      floorName,
      deskId: labelOverride || el.deskId || '(unnamed office)',
      type: 'private-office',
      capacity: el.capacity,
      occupied: el.assignedEmployeeIds.length,
      occupantNames: el.assignedEmployeeIds.map((id) => nameOf(employees, id) ?? '—'),
      neighborhoodName,
    }
  }
  return null
}

function nameOf(employees: Record<string, Employee>, id: string): string | null {
  return employees[id]?.name ?? null
}

/**
 * Cheap point-in-rect test: a seat "belongs to" a neighborhood if the
 * seat's center lies inside the neighborhood's bounds. Neighborhoods
 * don't actually own elements (they're decorative regions), so this is
 * the only locality signal available — it's good enough for picker
 * grouping/labeling. First match wins; overlapping neighborhoods are
 * a user-authored anomaly we don't try to disambiguate here.
 */
function findEnclosingNeighborhood(
  el: CanvasElement,
  neighborhoods: Neighborhood[],
): string | null {
  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2
  for (const n of neighborhoods) {
    if (cx >= n.x && cx <= n.x + n.width && cy >= n.y && cy <= n.y + n.height) {
      return n.name
    }
  }
  return null
}
