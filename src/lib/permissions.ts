import type { OfficeRole } from './offices/permissionsRepository'

/**
 * `shareViewer` is the synthetic role issued to anonymous visitors who land
 * on a D6 view-only share link. It isn't persisted to `office_permissions`
 * — it lives in-memory on the client once the share token has been
 * validated by `shareLinksStore.isTokenValid` — and it grants nothing
 * except `viewMap`. In particular it explicitly denies `viewPII` so the
 * roster is redacted, and every write action (editMap, editRoster, etc.)
 * returns `false` via the empty matrix entry.
 */
export type Role = OfficeRole | 'shareViewer'
export type Action =
  | 'editRoster'
  | 'editMap'
  | 'manageTeam'
  | 'viewAuditLog'
  | 'viewReports'
  | 'viewSeatHistory'
  | 'manageBilling'
  | 'generateShareLink'
  // Lowest-privilege read: "may see the map + the redacted roster". A
  // share-link visitor gets exactly this and nothing else. Roles that
  // already have `editMap` implicitly get `viewMap` (see MATRIX below).
  | 'viewMap'
  // GDPR / dignity gate. Roles without `viewPII` see a reduced employee
  // projection (initials, blanked email/manager/schedule/tags/photo). Any
  // role that can mutate the roster (editRoster) necessarily has it so the
  // edit surface doesn't hand out write access to data the user can't see.
  | 'viewPII'
  // IT/AV/Network/Power layer (M2). Gates the View-menu toggles, the
  // library tiles for IT-device types, the type-specific Properties
  // sections, and the canvas rendering of IT-device elements. Default
  // truth table grants access to roles that already shape the floor
  // plan (owner/editor/space-planner): the IT layer is layout work, not
  // roster work, so HR-editor stays opted out. Viewer + shareViewer are
  // also opted out — they can still see the rest of the office without
  // wifi heat-map footprint clutter.
  | 'viewITLayer'

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
    'manageBilling', 'generateShareLink', 'viewMap', 'viewPII',
    'viewITLayer',
  ],
  editor: ['editRoster', 'editMap', 'viewReports', 'viewSeatHistory', 'viewMap', 'viewPII', 'viewITLayer'],
  'hr-editor': ['editRoster', 'viewAuditLog', 'viewReports', 'viewSeatHistory', 'viewMap', 'viewPII'],
  'space-planner': ['editMap', 'viewReports', 'viewSeatHistory', 'viewMap', 'viewITLayer'],
  viewer: ['viewMap'],
  // Anonymous share-link visitor: literally the map. No PII, no reports,
  // no seat history, and certainly no edits. The `useCan` gates on every
  // mutating surface are what actually enforce the read-only contract —
  // leaving this role with an array of one action is intentional.
  shareViewer: ['viewMap'],
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
