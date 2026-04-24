import type { Employee } from '../types/employee'

/**
 * Result of running {@link commitDueStatusChanges}. `transitions`
 * documents only the status-changing commits — entries where the
 * pending status matched the current one are dropped silently from the
 * queue but not counted as a transition, so audit trails don't show
 * no-op "active → active" rows.
 */
export interface CommitResult {
  employeesChanged: number
  transitions: Array<{
    employeeId: string
    from: Employee['status']
    to: Employee['status']
    effectiveDate: string
  }>
  nextEmployees: Record<string, Employee>
}

/**
 * Pure function. Given an employee map and a reference `today`
 * (`yyyy-mm-dd`), returns the post-commit map plus an audit trail.
 *
 * Semantics
 * ---------
 * - For each employee, every `pendingStatusChange` whose
 *   `effectiveDate <= today` is applied in date order. The final status
 *   is the LAST due entry's status (i.e. if two past entries sit in the
 *   queue because the app hasn't been opened in a while, we land on the
 *   more-recent one, not some interpolation).
 * - Applied entries are removed from the queue regardless of whether
 *   they actually changed the status. A pending entry that targets the
 *   same status the employee already holds is a silent drop — NOT a
 *   counted transition.
 * - Future-dated entries (`effectiveDate > today`) stay in the queue.
 *
 * Purity
 * ------
 * Input maps and arrays are not mutated. Calling the function twice
 * with the same inputs returns structurally equal outputs (modulo new
 * object identity) — tests rely on this.
 */
export function commitDueStatusChanges(
  employees: Record<string, Employee>,
  today: string,
): CommitResult {
  const nextEmployees: Record<string, Employee> = {}
  const transitions: CommitResult['transitions'] = []
  let employeesChanged = 0

  for (const [id, employee] of Object.entries(employees)) {
    const queue = employee.pendingStatusChanges ?? []
    if (queue.length === 0) {
      nextEmployees[id] = employee
      continue
    }
    // Snapshot + sort ascending by effectiveDate. Input is documented
    // as sorted, but we don't want commit to be wrong if a caller hands
    // us an unsorted array (tests, hand-edited fixtures, future bugs).
    const sorted = [...queue].sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate),
    )
    const due: typeof sorted = []
    const remaining: typeof sorted = []
    for (const change of sorted) {
      if (change.effectiveDate <= today) due.push(change)
      else remaining.push(change)
    }
    if (due.length === 0) {
      // No change — preserve existing object identity so consumers can
      // cheap-compare when nothing actually happened this tick.
      nextEmployees[id] = employee
      continue
    }
    let status = employee.status
    for (const change of due) {
      if (change.status !== status) {
        transitions.push({
          employeeId: id,
          from: status,
          to: change.status,
          effectiveDate: change.effectiveDate,
        })
        status = change.status
      }
    }
    nextEmployees[id] = {
      ...employee,
      status,
      pendingStatusChanges: remaining,
    }
    employeesChanged++
  }

  return { employeesChanged, transitions, nextEmployees }
}
