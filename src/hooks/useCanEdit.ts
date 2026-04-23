import { useProjectStore } from '../stores/projectStore'

/**
 * Authoritative "is the viewer allowed to edit this office?" hook.
 *
 * Resolves from `projectStore.currentOfficeRole` (populated by
 * `ProjectShell` after office load via `currentUserOfficeRole`).
 *
 * Returns `true` for `owner` and `editor`; `false` for `viewer`; `true`
 * when the role is `null` (unknown). Failing open on unknown is a
 * deliberate pilot-era choice: the office load path fails open too, and
 * RLS is the real authority — this hook exists to disable UI affordances,
 * not to enforce security. Locking editors out on a transient Supabase
 * error would be a worse bug than briefly showing edit affordances to a
 * viewer during a race.
 */
export function useCanEdit(): boolean {
  const role = useProjectStore((s) => s.currentOfficeRole)
  if (role === 'viewer') return false
  return true
}
