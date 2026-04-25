/**
 * Plan-health analyzer — surfaces structural problems in an office plan that
 * would otherwise be silent footguns: orphan references, unattached fixtures,
 * overlapping desks, and capacity violations. The output is consumed by the
 * `PlanHealthPill` in the TopBar and the click-through `PlanHealthDrawer`.
 *
 * The analyzer is deliberately a pure function over plain snapshots (no
 * zustand calls) so the TopBar can re-derive on store change via `useMemo`
 * without the analyzer becoming part of any store's subscription graph, and
 * so unit tests don't have to spin up the full editor shell.
 *
 * All checks run across every floor — issues from non-active floors carry a
 * `floorId` so the drawer's "Jump to" can switch floors before selecting.
 */
import type { CanvasElement } from '../types/elements'
import {
  isDeskElement,
  isWorkstationElement,
  isPrivateOfficeElement,
  isDoorElement,
  isWindowElement,
  isWallElement,
} from '../types/elements'
import type { Employee } from '../types/employee'
import type { Neighborhood } from '../types/neighborhood'
import { elementBounds } from './elementBounds'

export type IssueSeverity = 'error' | 'warning' | 'info'

export type IssueCategory =
  | 'orphan'
  | 'attachment'
  | 'collision'
  | 'reference'
  | 'capacity'

export interface PlanIssue {
  /** Stable, deterministic id for React keys + dedupe. */
  id: string
  severity: IssueSeverity
  category: IssueCategory
  /** Short human label rendered as the row's headline. */
  message: string
  /** Optional one-line context shown beneath the headline. */
  detail?: string
  /** Where the issue lives. `null` only for purely employee-scoped issues
   *  whose seat reference is broken (we don't know which floor to jump to). */
  floorId: string | null
  /** Element / neighborhood / employee ids the drawer should highlight. */
  targetIds: string[]
}

export interface PlanHealth {
  errorCount: number
  warningCount: number
  infoCount: number
  /** Sorted: errors → warnings → info, then by category for stable ordering. */
  issues: PlanIssue[]
}

export interface PlanHealthInput {
  /** floorId → { elementId → element } for every floor in the office. */
  elementsByFloor: Record<string, Record<string, CanvasElement>>
  /** floorId → { neighborhoodId → neighborhood }. */
  neighborhoodsByFloor: Record<string, Record<string, Neighborhood>>
  /** Whole employee map keyed by id (these are not floor-scoped — an
   *  employee may live on a floor or be unassigned). */
  employees: Record<string, Employee>
  /** Stable order matters for output dedupe & test reproducibility. */
  floorIds: string[]
  activeFloorId: string | null
}

/** Distance in canvas units a door/window center may be from the nearest
 *  wall AABB before we flag it as unattached. ~20px matches the smallest
 *  wall thickness in the editor's tooling. */
const WALL_PROXIMITY_PX = 20
/** Minimum AABB-area-overlap ratio (relative to the smaller of the two
 *  desks) to flag a collision. >50% means the user almost certainly didn't
 *  intend the placement. */
const DESK_OVERLAP_RATIO = 0.5
/** Cap on emitted overlap-pair issues to keep the analyzer bounded on
 *  pathological inputs. */
const MAX_OVERLAP_PAIRS = 25

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
}
const CATEGORY_RANK: Record<IssueCategory, number> = {
  reference: 0,
  capacity: 1,
  attachment: 2,
  collision: 3,
  orphan: 4,
}

interface AABB {
  x: number
  y: number
  width: number
  height: number
}

function rectFromBounds(b: AABB): AABB {
  return b
}

function aabbIntersectionArea(a: AABB, b: AABB): number {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return 0
  return (right - x) * (bottom - y)
}

function aabbCenter(b: AABB): { x: number; y: number } {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

function aabbContains(outer: AABB, inner: AABB): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

function distancePointToAabb(px: number, py: number, b: AABB): number {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.width))
  const dy = Math.max(b.y - py, 0, py - (b.y + b.height))
  return Math.hypot(dx, dy)
}

function neighborhoodAabb(n: Neighborhood): AABB {
  return {
    x: n.x - n.width / 2,
    y: n.y - n.height / 2,
    width: n.width,
    height: n.height,
  }
}

function elementLabel(el: CanvasElement): string {
  // Prefer deskId for assignable elements (more recognizable to FMs) and
  // fall back to the user-set label or the element type.
  if (
    (isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el)) &&
    'deskId' in el &&
    typeof el.deskId === 'string' &&
    el.deskId
  ) {
    return el.deskId
  }
  if (el.label && el.label.trim()) return el.label
  return el.type
}

export function analyzePlan(input: PlanHealthInput): PlanHealth {
  const { elementsByFloor, neighborhoodsByFloor, employees, floorIds } = input
  const issues: PlanIssue[] = []

  // Build a global elementId → { element, floorId } index so cross-floor
  // employee-seat lookups don't have to scan every floor map repeatedly.
  const elementIndex = new Map<string, { el: CanvasElement; floorId: string }>()
  for (const floorId of floorIds) {
    const map = elementsByFloor[floorId] || {}
    for (const id in map) {
      elementIndex.set(id, { el: map[id], floorId })
    }
  }

  // ── 1 & 2. Employee↔desk reference integrity ─────────────────────────────
  for (const empId in employees) {
    const emp = employees[empId]
    if (emp.seatId) {
      const hit = elementIndex.get(emp.seatId)
      if (!hit) {
        issues.push({
          id: `emp-ref-broken:${emp.id}`,
          severity: 'error',
          category: 'reference',
          message: `${emp.name || 'Unnamed employee'} assigned to a deleted desk`,
          detail: `Seat id ${shortId(emp.seatId)} no longer exists`,
          floorId: emp.floorId ?? null,
          targetIds: [emp.id],
        })
      }
    }
  }

  // Per-floor checks ─────────────────────────────────────────────────────────
  for (const floorId of floorIds) {
    const elsMap = elementsByFloor[floorId] || {}
    const elements = Object.values(elsMap)
    const walls = elements.filter(isWallElement)

    // Desk → assigned employee integrity (single-seat desks)
    for (const el of elements) {
      if (isDeskElement(el)) {
        if (el.assignedEmployeeId && !employees[el.assignedEmployeeId]) {
          issues.push({
            id: `desk-emp-missing:${el.id}`,
            severity: 'error',
            category: 'reference',
            message: `Desk ${elementLabel(el)} references a deleted employee`,
            detail: `Employee id ${shortId(el.assignedEmployeeId)} no longer exists`,
            floorId,
            targetIds: [el.id],
          })
        }

        // Hot-desk should not carry a persistent assignment.
        if (el.type === 'hot-desk' && el.assignedEmployeeId) {
          issues.push({
            id: `hot-desk-assigned:${el.id}`,
            severity: 'warning',
            category: 'reference',
            message: `Hot-desk ${elementLabel(el)} has a persistent assignee`,
            detail: 'Hot-desks are usually unassigned — consider clearing the seat.',
            floorId,
            targetIds: [el.id],
          })
        }
      }

      // 3 & 4. Workstation capacity & reference integrity. The sparse
      // positional array makes "over capacity" a slightly different
      // proposition: the array length === positions by construction
      // (the migration enforces it), so over-cap can only occur when
      // FILLED slots exceed positions — which shouldn't happen, but
      // count the non-null entries defensively for parity with the
      // private-office check below.
      if (isWorkstationElement(el)) {
        const ids = el.assignedEmployeeIds ?? []
        const occupants = ids.filter((id): id is string => !!id)
        if (occupants.length > el.positions) {
          issues.push({
            id: `ws-overcap:${el.id}`,
            severity: 'error',
            category: 'capacity',
            message: `Workstation ${elementLabel(el)} is over capacity`,
            detail: `${occupants.length} assigned, only ${el.positions} positions`,
            floorId,
            targetIds: [el.id],
          })
        }
        const stale = occupants.filter((id) => !employees[id])
        if (stale.length > 0) {
          issues.push({
            id: `ws-stale-emp:${el.id}`,
            severity: 'error',
            category: 'reference',
            message: `Workstation ${elementLabel(el)} references deleted employees`,
            detail: `${stale.length} stale employee id${stale.length === 1 ? '' : 's'}`,
            floorId,
            targetIds: [el.id],
          })
        }
      }

      if (isPrivateOfficeElement(el)) {
        const ids = el.assignedEmployeeIds ?? []
        if (ids.length > el.capacity) {
          issues.push({
            id: `po-overcap:${el.id}`,
            severity: 'error',
            category: 'capacity',
            message: `Private office ${elementLabel(el)} is over capacity`,
            detail: `${ids.length} assigned, capacity ${el.capacity}`,
            floorId,
            targetIds: [el.id],
          })
        }
        const stale = ids.filter((id) => !employees[id])
        if (stale.length > 0) {
          issues.push({
            id: `po-stale-emp:${el.id}`,
            severity: 'error',
            category: 'reference',
            message: `Private office ${elementLabel(el)} references deleted employees`,
            detail: `${stale.length} stale employee id${stale.length === 1 ? '' : 's'}`,
            floorId,
            targetIds: [el.id],
          })
        }
      }
    }

    // 5. Door / window unattached. We use a simple proximity-to-wall-AABB
    //    check rather than the precise wallAttachment hit-test because the
    //    point of this signal is "did the user drag a door away from any
    //    wall". Walls keep their points in absolute world coords, so
    //    `elementBounds` already gives us a usable AABB.
    const wallBoxes: AABB[] = walls
      .map((w) => elementBounds(w))
      .filter((b): b is AABB => b !== null)

    for (const el of elements) {
      if (!isDoorElement(el) && !isWindowElement(el)) continue
      const b = elementBounds(el)
      if (!b) continue
      const center = aabbCenter(b)

      // Fast path: declared parent wall still exists → considered attached.
      const parentId = el.parentWallId
      if (parentId && elementIndex.get(parentId)?.el.type === 'wall') continue

      let nearest = Infinity
      for (const wb of wallBoxes) {
        const d = distancePointToAabb(center.x, center.y, wb)
        if (d < nearest) nearest = d
        if (nearest === 0) break
      }
      if (nearest > WALL_PROXIMITY_PX) {
        issues.push({
          id: `unattached:${el.id}`,
          severity: 'warning',
          category: 'attachment',
          message: `${el.type === 'door' ? 'Door' : 'Window'} not attached to a wall`,
          detail: walls.length === 0
            ? 'No walls on this floor.'
            : `Nearest wall is ${Math.round(nearest)}px away`,
          floorId,
          targetIds: [el.id],
        })
      }
    }

    // 6. Desk overlap. Bounded O(n²) but capped at MAX_OVERLAP_PAIRS emitted
    //    issues so we never publish a wall of duplicates. We still scan all
    //    pairs (the work is cheap); we just stop emitting once the cap is
    //    reached for this floor.
    const desks = elements.filter(
      (el) => isDeskElement(el) || isWorkstationElement(el) || isPrivateOfficeElement(el),
    )
    const deskBoxes = desks
      .map((d) => ({ id: d.id, label: elementLabel(d), box: elementBounds(d) }))
      .filter((d): d is { id: string; label: string; box: AABB } => d.box !== null)

    let emittedPairs = 0
    for (let i = 0; i < deskBoxes.length && emittedPairs < MAX_OVERLAP_PAIRS; i++) {
      for (let j = i + 1; j < deskBoxes.length && emittedPairs < MAX_OVERLAP_PAIRS; j++) {
        const a = deskBoxes[i]
        const b = deskBoxes[j]
        const inter = aabbIntersectionArea(a.box, b.box)
        if (inter <= 0) continue
        const minArea = Math.min(
          a.box.width * a.box.height,
          b.box.width * b.box.height,
        )
        if (minArea <= 0) continue
        if (inter / minArea < DESK_OVERLAP_RATIO) continue

        // Stable id: sort the pair so the same overlap doesn't dupe under
        // either iteration order.
        const [first, second] = a.id < b.id ? [a, b] : [b, a]
        issues.push({
          id: `overlap:${first.id}:${second.id}`,
          severity: 'warning',
          category: 'collision',
          message: `Desks ${first.label} and ${second.label} overlap`,
          detail: 'Overlapping desks usually indicate a stale paste or duplicate import.',
          floorId,
          targetIds: [first.id, second.id],
        })
        emittedPairs++
      }
    }

    // 8. Empty neighborhoods.
    const neighborhoodMap = neighborhoodsByFloor[floorId] || {}
    for (const nbId in neighborhoodMap) {
      const nb = neighborhoodMap[nbId]
      const nbBox = rectFromBounds(neighborhoodAabb(nb))
      const containsAny = desks.some((d) => {
        const b = elementBounds(d)
        return b ? aabbContains(nbBox, b) : false
      })
      if (!containsAny) {
        issues.push({
          id: `empty-neighborhood:${nb.id}`,
          severity: 'info',
          category: 'orphan',
          message: `Neighborhood "${nb.name || 'Unnamed'}" has no desks inside it`,
          detail: 'Drag the rectangle over desks or move desks into it.',
          floorId,
          targetIds: [nb.id],
        })
      }
    }
  }

  // Sort + dedupe ─────────────────────────────────────────────────────────
  const seen = new Set<string>()
  const unique: PlanIssue[] = []
  for (const i of issues) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    unique.push(i)
  }

  unique.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (sev !== 0) return sev
    const cat = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]
    if (cat !== 0) return cat
    return a.id.localeCompare(b.id)
  })

  let errorCount = 0
  let warningCount = 0
  let infoCount = 0
  for (const i of unique) {
    if (i.severity === 'error') errorCount++
    else if (i.severity === 'warning') warningCount++
    else infoCount++
  }

  return { errorCount, warningCount, infoCount, issues: unique }
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 6)}…` : id
}
