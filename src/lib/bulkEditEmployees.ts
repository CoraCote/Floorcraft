import type { EmployeeStatus } from '../types/employee'

/**
 * A bulk-edit patch. Fields are tri-state:
 *   - `null`        → skip this field (leave each employee's value unchanged)
 *   - `''`          → clear this field (set to null on the employee)
 *   - non-empty str → set this field to the value on every selected employee
 *
 * Status is slightly different: it's either `null` (skip) or a valid
 * `EmployeeStatus` value. We don't allow "clear status" because every
 * employee must have one.
 */
export interface BulkEditPatch {
  department: string | null
  title: string | null
  team: string | null
  status: EmployeeStatus | null
}

/**
 * Apply a bulk edit to a list of ids by calling `update(id, patch)` for
 * each id. Fields with value `null` are omitted; empty strings become
 * `null` on the resulting patch (= "clear this field" on the employee).
 *
 * Pure: no stores, no React. The caller wires `update` to
 * `employeeStore.updateEmployee`.
 */
export function applyBulkEdit(
  ids: string[],
  patch: BulkEditPatch,
  update: (id: string, updates: Record<string, unknown>) => void,
): void {
  const effective: Record<string, unknown> = {}
  if (patch.department !== null) {
    effective.department = patch.department === '' ? null : patch.department
  }
  if (patch.title !== null) {
    effective.title = patch.title === '' ? null : patch.title
  }
  if (patch.team !== null) {
    effective.team = patch.team === '' ? null : patch.team
  }
  if (patch.status !== null) {
    effective.status = patch.status
  }
  if (Object.keys(effective).length === 0) return
  for (const id of ids) {
    update(id, { ...effective })
  }
}
