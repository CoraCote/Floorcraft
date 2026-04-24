import { useMemo } from 'react'
import { useEmployeeStore } from '../stores/employeeStore'
import { useCan } from './useCan'
import { redactEmployeeMap } from '../lib/redactEmployee'
import type { Employee } from '../types/employee'

/**
 * Display-layer read of the employee store that respects the `viewPII`
 * capability. Components rendering employee fields should consume this
 * hook instead of `useEmployeeStore(s => s.employees)` so the redaction
 * is enforced in one place — a missed call site is a PII leak.
 *
 * Mutation paths (addEmployee, updateEmployee, …) should still use the
 * store directly: the editor role that can mutate also has `viewPII`,
 * so the two concerns don't collide.
 *
 * When `viewPII` is granted the raw store object is returned unchanged,
 * so identity-stable downstream `useMemo` dependencies stay stable.
 */
export function useVisibleEmployees(): Record<string, Employee> {
  const employees = useEmployeeStore((s) => s.employees)
  const canViewPII = useCan('viewPII')
  return useMemo(
    () => (canViewPII ? employees : redactEmployeeMap(employees)),
    [employees, canViewPII],
  )
}
