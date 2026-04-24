import { useProjectStore } from '../stores/projectStore'
import { can, type Action } from '../lib/permissions'

/**
 * Returns whether the current viewer can perform `action`.
 *
 * Effective role = `impersonatedRole ?? currentOfficeRole`. The owner-only
 * "View as…" feature lets an owner preview the UI as a lower-privileged
 * role by setting `impersonatedRole`; `useCan` (and everything that calls
 * it) then gates as if the viewer *were* that role. Server calls are
 * unaffected — the user still holds the owner token, so nothing can be
 * mutated that their real role can't already mutate.
 *
 * `shareViewer` is a synthetic role installed by `ShareView` after a
 * share-link token has been validated. It grants only `viewMap`, denies
 * `viewPII` (so the roster auto-redacts), and leaves every write action
 * `false`. Impersonation cannot reach it — only the share-view path ever
 * calls `setCurrentOfficeRole('shareViewer')`.
 */
export function useCan(action: Action): boolean {
  const role = useProjectStore((s) => s.impersonatedRole ?? s.currentOfficeRole)
  return can(role, action)
}
