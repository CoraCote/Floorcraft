import { supabase } from '../supabase'
import { slugFromName } from '../slug'

export interface OfficeListItem {
  id: string
  slug: string
  name: string
  updated_at: string
  is_private: boolean
}

export interface OfficeLoaded extends OfficeListItem {
  team_id: string
  payload: Record<string, unknown>
  created_by: string
}

export async function listOffices(teamId: string): Promise<OfficeListItem[]> {
  const { data, error } = await supabase
    .from('offices')
    .select('id, slug, name, updated_at, is_private')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OfficeListItem[]
}

export async function loadOffice(teamId: string, officeSlug: string): Promise<OfficeLoaded | null> {
  const { data, error } = await supabase
    .from('offices')
    .select('id, team_id, slug, name, is_private, created_by, payload, updated_at')
    .eq('team_id', teamId)
    .eq('slug', officeSlug)
    .single()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null // no rows
    throw error
  }
  return data as OfficeLoaded
}

export async function createOffice(teamId: string, name: string): Promise<OfficeListItem> {
  const { data, error } = await supabase
    .from('offices')
    .insert({ team_id: teamId, name, slug: slugFromName(name), payload: {} })
    .select('id, slug, name, updated_at, is_private')
    .single()
  if (error) throw error
  return data as OfficeListItem
}

export interface SaveResult {
  ok: true
  updated_at: string
}
export interface ConflictResult {
  ok: false
  reason: 'conflict'
}
export interface ErrorResult {
  ok: false
  reason: 'error'
  message: string
}

export async function saveOffice(
  id: string,
  payload: Record<string, unknown>,
  loadedVersion: string,
): Promise<SaveResult | ConflictResult | ErrorResult> {
  const { data, error } = await supabase
    .from('offices')
    .update({ payload })
    .eq('id', id)
    .eq('updated_at', loadedVersion)
    .select('updated_at')
    .maybeSingle()
  if (error) return { ok: false, reason: 'error', message: error.message }
  if (!data) return { ok: false, reason: 'conflict' }
  return { ok: true, updated_at: (data as { updated_at: string }).updated_at }
}

/**
 * Overwrite the server copy unconditionally. Used by the conflict
 * resolver when the admin accepts their local copy over whatever the
 * server currently holds.
 *
 * Critically, this goes through the `save_office_force` RPC rather
 * than a plain UPDATE. The RPC runs in a single transaction that:
 *   1. SELECT … FOR UPDATE the current row (the authoritative base —
 *      the client's `loadedVersion` may be stale by the time the user
 *      clicked Overwrite).
 *   2. INSERT into `offices_history` so the prior payload is
 *      recoverable if the user later realises they clobbered a
 *      teammate's work.
 *   3. UPDATE the row and return the new `updated_at`.
 *
 * The RPC also re-checks authorization (RLS is bypassed for
 * SECURITY DEFINER) so the endpoint can't be called by a
 * non-editor.
 */
export async function saveOfficeForce(
  id: string,
  payload: Record<string, unknown>,
): Promise<SaveResult | ErrorResult> {
  const { data, error } = await supabase.rpc('save_office_force', {
    p_office_id: id,
    p_payload: payload,
  })
  if (error) return { ok: false, reason: 'error', message: error.message }
  if (typeof data !== 'string') {
    return { ok: false, reason: 'error', message: 'save_office_force: unexpected response shape' }
  }
  return { ok: true, updated_at: data }
}
