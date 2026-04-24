import type { OfficeRole } from './offices/permissionsRepository'

export type Role = OfficeRole
export type Action =
  | 'editRoster'
  | 'editMap'
  | 'manageTeam'
  | 'viewAuditLog'
  | 'viewReports'
  | 'viewSeatHistory'
  | 'manageBilling'
  | 'generateShareLink'
  // GDPR / dignity gate. Roles without `viewPII` see a reduced employee
  // projection (initials, blanked email/manager/schedule/tags/photo). Any
  // role that can mutate the roster (editRoster) necessarily has it so the
  // edit surface doesn't hand out write access to data the user can't see.
  | 'viewPII'

/**
 * Pilot-era permissions matrix. Legacy `editor` = hr-editor ∪ space-planner
 * so existing office_permissions rows keep their current capabilities.
 * New assignments should prefer the narrower roles.
 *
 * `viewSeatHistory` gates the append-only seat-assignment timeline. HR
 * admins own the seating records (that's their audit trail), and the
 * legacy editor / space-planner roles are granted access because they
 * already see the *current* assignment on the map — hiding the past from
 * the people who edit the present would be surprising. Viewers stay
 * opted-out: they can read the layout but not the churn behind it.
 */
const MATRIX: Record<Role, Action[]> = {
  owner: [
    'editRoster', 'editMap', 'manageTeam',
    'viewAuditLog', 'viewReports', 'viewSeatHistory',
    'manageBilling', 'generateShareLink', 'viewPII',
  ],
  editor: ['editRoster', 'editMap', 'viewReports', 'viewSeatHistory', 'viewPII'],
  'hr-editor': ['editRoster', 'viewAuditLog', 'viewReports', 'viewSeatHistory', 'viewPII'],
  'space-planner': ['editMap', 'viewReports', 'viewSeatHistory'],
  viewer: [],
}

export function can(role: Role | null, action: Action): boolean {
  if (role === null) {
    // Transient load state: fail closed on everything.
    return false
  }
  const allowed = MATRIX[role]
  if (!allowed) return false
  return allowed.includes(action)
}
