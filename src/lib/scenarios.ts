/**
 * What-if capacity planning primitives.
 *
 * A scenario is a transient object — it lives only in the in-memory Zustand
 * store (`src/stores/scenariosStore.ts`, no persistence). It captures a
 * snapshot of the office's current active-headcount / seat totals and a list
 * of hypothetical adjustments ("add 10 engineers", "add a 40-seat floor",
 * "remove 5 designers") that are applied numerically to project future
 * occupancy without ever touching the real employee or elements stores.
 *
 * All helpers here are pure. The UI layer computes a projection on every
 * render via `projectScenario(base, adjustments)` and diffs it against the
 * baseline — nothing writes back to Supabase, and the real rosters, seats,
 * and map elements are never mutated, which is the entire point of the
 * "what-if" surface.
 */

export interface ScenarioBaseSnapshot {
  /**
   * Active employee count at the moment the scenario was spawned. "Active"
   * follows the same definition `computeUtilizationMetrics` uses —
   * `status !== 'departed'`.
   */
  activeEmployees: number
  /**
   * Active employee count bucketed by department. Null / empty department
   * names are normalised to the literal string "Unassigned" so the UI can
   * display an entry for them and adjustments can target them by name.
   */
  employeesByDepartment: Record<string, number>
  /** Total seat capacity across all floors at snapshot time. */
  totalSeats: number
  /** Seats with at least one assigned employee at snapshot time. */
  assignedSeats: number
}

export type ScenarioAdjustment =
  | { id: string; type: 'add-headcount'; department: string; count: number }
  | { id: string; type: 'remove-headcount'; department: string; count: number }
  | { id: string; type: 'add-seats'; count: number }

export interface Scenario {
  id: string
  name: string
  baseSnapshot: ScenarioBaseSnapshot
  adjustments: ScenarioAdjustment[]
}

/** Label we use for employees whose `department` is null / empty. */
export const UNASSIGNED_DEPARTMENT = 'Unassigned'

/**
 * Projected totals derived from applying `adjustments` to `base`. All fields
 * are numeric — the scenario model intentionally deals in counts, never in
 * named employees, so there's no PII risk regardless of the viewer's role.
 */
export interface ScenarioProjection {
  activeEmployees: number
  employeesByDepartment: Record<string, number>
  totalSeats: number
  /**
   * Ratio of *projected* active employees to *projected* total seats,
   * clamped at [0, ∞). This is a demand-side measure — the simulator
   * doesn't attempt to guess how many of the new hires would have a seat
   * assigned, so we compare headcount to capacity rather than the
   * assignment ratio used on the live map.
   *
   * 0 when `totalSeats` is 0, matching the live `computeUtilizationMetrics`
   * contract.
   */
  occupancyRatio: number
}

/**
 * Pure projection — apply a list of adjustments to a base snapshot and
 * return the resulting counts. Callers must treat the returned object as
 * immutable; internally we build a fresh `employeesByDepartment` map so
 * the base snapshot is never mutated.
 *
 * Rules:
 *   - `add-headcount`   — adds to both the department bucket and the
 *     overall `activeEmployees` total. A new department name creates a
 *     new bucket.
 *   - `remove-headcount` — clamped at zero for both the department bucket
 *     and the overall total. Removing from a department that doesn't
 *     exist is a no-op (not an error — the UI has no reason to crash on
 *     a stale scenario whose department was renamed elsewhere).
 *   - `add-seats`       — adds to `totalSeats`. Negative counts are
 *     ignored (the UI only offers a positive input, but pure code should
 *     still defend itself).
 *
 * The empty-adjustment-list case short-circuits to a clone of the base,
 * so the detail pane can always render a delta of zero without special
 * cases.
 */
export function projectScenario(
  base: ScenarioBaseSnapshot,
  adjustments: readonly ScenarioAdjustment[],
): ScenarioProjection {
  let activeEmployees = base.activeEmployees
  let totalSeats = base.totalSeats
  const byDept: Record<string, number> = { ...base.employeesByDepartment }

  for (const adj of adjustments) {
    if (adj.type === 'add-headcount') {
      if (adj.count <= 0) continue
      const dept = adj.department || UNASSIGNED_DEPARTMENT
      byDept[dept] = (byDept[dept] ?? 0) + adj.count
      activeEmployees += adj.count
      continue
    }
    if (adj.type === 'remove-headcount') {
      if (adj.count <= 0) continue
      const dept = adj.department || UNASSIGNED_DEPARTMENT
      // If the department doesn't exist in the map, there's nothing to
      // remove — skip, rather than materialising an empty bucket (which
      // would be a no-op numerically but confuse the UI).
      if (!(dept in byDept)) continue
      const current = byDept[dept] ?? 0
      // Clamp removals — we can't take the department into negative
      // territory, and we only debit the overall total by the amount we
      // actually removed (so "remove 10 from a 3-person team" results in
      // activeEmployees going down by 3, not 10).
      const removed = Math.min(current, adj.count)
      byDept[dept] = current - removed
      activeEmployees -= removed
      continue
    }
    // add-seats
    if (adj.count <= 0) continue
    totalSeats += adj.count
  }

  // Clamp overall total to zero just in case the base itself arrived
  // negative (shouldn't happen, but pure-function defence is cheap).
  if (activeEmployees < 0) activeEmployees = 0
  if (totalSeats < 0) totalSeats = 0

  const occupancyRatio = totalSeats > 0 ? activeEmployees / totalSeats : 0

  return {
    activeEmployees,
    employeesByDepartment: byDept,
    totalSeats,
    occupancyRatio,
  }
}

/**
 * Convenience — the projection a scenario *would* produce if it had no
 * adjustments. Used by the UI to compute the "current today" column
 * alongside the projected column without duplicating the math.
 */
export function baselineProjection(base: ScenarioBaseSnapshot): ScenarioProjection {
  return projectScenario(base, [])
}
