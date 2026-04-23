import { supabase } from '../supabase'
import type { OfficeLoaded } from './officeRepository'

/**
 * Load an office row by primary key. Used by the anonymous
 * `/shared/:projectId/:token` flow — the RLS policy
 * `offices_public_via_share_token` restricts the rows anon can see to
 * ones with a live share_tokens entry, so callers that don't first
 * resolve the token will get a `null` here rather than a leaked row.
 */
export async function loadOfficeById(officeId: string): Promise<OfficeLoaded | null> {
  const { data, error } = await supabase
    .from('offices')
    .select('id, team_id, slug, name, is_private, created_by, payload, updated_at')
    .eq('id', officeId)
    .maybeSingle()
  if (error) return null
  return (data as OfficeLoaded | null) ?? null
}
