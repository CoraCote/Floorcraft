import type { OfficeRole } from './offices/permissionsRepository'

export type Role = OfficeRole
export type Action =
  | 'editRoster'
  | 'editMap'
  | 'manageTeam'
  | 'viewAuditLog'
  | 'viewReports'
  | 'manageBilling'
  | 'generateShareLink'

/**
 * Pilot-era permissions matrix. Legacy `editor` = hr-editor ∪ space-planner
 * so existing office_permissions rows keep their current capabilities.
 * New assignments should prefer the narrower roles.
 */
const MATRIX: Record<Role, Action[]> = {
  owner: [
    'editRoster', 'editMap', 'manageTeam',
    'viewAuditLog', 'viewReports', 'manageBilling', 'generateShareLink',
  ],
  editor: ['editRoster', 'editMap', 'viewReports'],
  'hr-editor': ['editRoster', 'viewAuditLog', 'viewReports'],
  'space-planner': ['editMap', 'viewReports'],
  viewer: ['viewReports'],
}

export function can(role: Role | null, action: Action): boolean {
  if (role === null) {
    // Transient load state: fail-open on inert views only.
    return action === 'viewReports'
  }
  const allowed = MATRIX[role]
  if (!allowed) return false
  return allowed.includes(action)
}
