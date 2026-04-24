import type { Employee } from '../types/employee'

/**
 * GDPR / dignity projection used wherever the acting user lacks the
 * `viewPII` capability. We strip the set of fields that either identify
 * an individual (email, manager, photo) or paint a fine-grained picture
 * of their routine (schedule, dates, tags). Non-PII fields — department,
 * team, title, employment type, status, seat assignment — survive because
 * they're needed for space planning: a viewer legitimately needs to see
 * that `Engineering` is 40 people without learning who those 40 are.
 *
 * Applied on read only; `useEmployeeStore` still holds the real records
 * for editor-role paths and mutation flows. This module must never write.
 */
export function redactEmployee(e: Employee): Employee {
  return {
    ...e,
    name: toInitials(e.name),
    email: '',
    managerId: null,
    startDate: null,
    endDate: null,
    departureDate: null,
    expectedReturnDate: null,
    coverageEmployeeId: null,
    leaveNotes: null,
    photoUrl: null,
    // Tags are free-text and can encode sensitive flags (medical,
    // performance, visa). Redact by default.
    tags: [],
    // Per-person schedules are PII; aggregate day-of-week headcount
    // remains available via `status`/`department` planning UIs.
    officeDays: [],
  }
}

/**
 * Turn a full name into a short initial string used as the viewer-visible
 * stand-in. Empty / whitespace-only input falls back to `'?'` so UIs don't
 * render a zero-width label that looks like a rendering bug.
 */
export function toInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  return parts.map((p) => `${p[0]!.toUpperCase()}.`).join('')
}

/**
 * Batch variant — returns a new object with every value replaced by its
 * redacted projection. Used by `useVisibleEmployees` and the CSV export
 * path. Preserves keys so downstream `employees[id]` lookups keep working.
 */
export function redactEmployeeMap(
  employees: Record<string, Employee>,
): Record<string, Employee> {
  const out: Record<string, Employee> = {}
  for (const id in employees) {
    out[id] = redactEmployee(employees[id])
  }
  return out
}
