import type { EmployeeStatus } from '../../../types/employee'

/**
 * Semantic status pill. Used in read-only contexts (viewer role) and as
 * the visual sibling of the inline-edit <select>. Shape matches the
 * DepartmentChip (rounded-full, text-xs, font-medium) so the roster row
 * reads as a row of pills rather than a mixed-shape grid.
 */
const PILL_CLASSES: Record<EmployeeStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  'on-leave': 'bg-amber-50 text-amber-700 border border-amber-100',
  departed: 'bg-gray-100 text-gray-500 border border-gray-200',
  'parental-leave': 'bg-amber-50 text-amber-800 border border-amber-100',
  sabbatical: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
  contractor: 'bg-teal-50 text-teal-700 border border-teal-100',
  intern: 'bg-slate-50 text-slate-700 border border-slate-200',
}

export function StatusPill({ status }: { status: EmployeeStatus }) {
  const cls = PILL_CLASSES[status] ?? PILL_CLASSES.active
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  )
}
