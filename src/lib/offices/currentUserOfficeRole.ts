import { supabase } from '../supabase'
import type { OfficeRole } from './permissionsRepository'

/**
 * Resolve the current viewer's effective role for a given office.
 *
 * Reads `office_permissions` for an explicit override; if none exists the
 * caller is treated as an `editor` (the pre-RBAC default for team members
 * with access to the office). Returns `null` only on a Supabase error so
 * callers can decide whether to fail open or closed — today's callers treat
 * `null` as permissive so a transient outage doesn't lock out operators.
 */
export async function currentUserOfficeRole(
  officeId: string,
  userId: string,
): Promise<OfficeRole | null> {
  const { data, error } = await supabase
    .from('office_permissions')
    .select('role')
    .eq('office_id', officeId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return null
  const explicit = (data as { role?: string } | null)?.role
  if (explicit === 'owner' || explicit === 'editor' || explicit === 'viewer') {
    return explicit
  }
  return 'editor'
}
