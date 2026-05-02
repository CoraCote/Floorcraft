import { supabase } from '../supabase'
import { slugFromName } from '../slug'

export interface OfficeListItem {
  id: string
  slug: string
  name: string
  updated_at: string
  is_private: boolean
  archived_at?: string | null
  /**
   * Office payload. Present on entries returned by `listOffices` (which
   * selects it so the team-home thumbnails can render without a second
   * round-trip per card); optional on the type so call sites that
   * construct an `OfficeListItem` locally (tests, `createOffice`) don't
   * need to mint an empty payload.
   */
  payload?: Record<string, unknown> | null
}

export interface OfficeLoaded extends OfficeListItem {
  team_id: string
  payload: Record<string, unknown>
  created_by: string
}

export async function listOffices(
  teamId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<OfficeListItem[]> {
  // `payload` is pulled here so the team-home page can render a
  // floor-plan thumbnail per office card in a single query. The payload
  // size grows with office complexity but is bounded by the same RLS
  // and UI the editor already loads — if this ever becomes a hot path
  // for teams with hundreds of offices, the thumbnail can be moved to
  // a derived `thumbnail_elements` column or a dedicated RPC.
  let query = supabase
    .from('offices')
    .select('id, slug, name, updated_at, is_private, archived_at, payload')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false })
  if (!opts.includeArchived) {
    query = query.is('archived_at', null)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as OfficeListItem[]
}

/**
 * Archive (soft-delete) an office. The row stays in place; the
 * server stamps `archived_at` + `archived_by`. The team-home
 * default `listOffices` call hides archived rows; users can opt in
 * via the "Show archived" toggle.
 */
export async function archiveOffice(officeId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_office', { p_office_id: officeId })
  if (error) throw error
}

export async function unarchiveOffice(officeId: string): Promise<void> {
  const { error } = await supabase.rpc('unarchive_office', { p_office_id: officeId })
  if (error) throw error
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

/**
 * Hard-delete an office row. Supabase's row-level policy gates this to
 * team admins / editors, so the call is safe to invoke directly from
 * the client — a permissions failure surfaces as an error the caller
 * can show rather than a silent no-op.
 *
 * The `offices.payload` column and any collaborators-related rows are
 * dropped on the server by foreign-key cascade, so the client doesn't
 * need to walk the object graph before deleting.
 */
export async function deleteOffice(id: string): Promise<void> {
  const { error } = await supabase.from('offices').delete().eq('id', id)
  if (error) throw error
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

/**
 * Rename an office. Updates only the `name` column — the `slug`
 * stays put. Renaming a slug would silently break every share link,
 * bookmark, and `/t/<team>/o/<slug>/...` URL the user has handed
 * out, so we keep the slug stable and let the operator generate a
 * new office (Duplicate + delete) if they want a fresh slug.
 *
 * RLS gates the update to owners + editors; the database returns a
 * permission error which surfaces to the UI as a normal error.
 */
export async function renameOffice(officeId: string, newName: string): Promise<void> {
  const trimmed = newName.trim()
  if (trimmed.length === 0) throw new Error('Office name cannot be empty')
  const { error } = await supabase
    .from('offices')
    .update({ name: trimmed })
    .eq('id', officeId)
  if (error) throw error
}

/**
 * Toggle the `is_private` flag on an office. Private offices are
 * gated by RLS — only invited collaborators can read/write — so
 * flipping this is a meaningful permission change. Same edit-gate
 * as renameOffice; the database refuses if the caller lacks
 * permissions.
 */
export async function setOfficePrivacy(
  officeId: string,
  isPrivate: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('offices')
    .update({ is_private: isPrivate })
    .eq('id', officeId)
  if (error) throw error
}

/**
 * Duplicate an office by copying its `payload` into a brand-new row.
 * The caller picks the new name (the kebab menu suggests
 * "<original> (copy)"); we slug the name and let any unique-slug
 * collision surface as a normal supabase error so the UI can show a
 * meaningful message rather than silently swallowing it.
 *
 * Privacy is intentionally NOT copied — duplicating a private office
 * into another private office would be surprising for the team that
 * was supposed to be the only audience. The duplicate starts public
 * by default; the operator can toggle privacy in office settings if
 * they want.
 *
 * Share tokens, comments, and history are not part of the payload;
 * they live in their own tables and are not copied. This matches
 * Linear/Notion duplicate semantics — you get a fresh, clean copy of
 * the document, not an entangled clone of the surrounding metadata.
 */
export async function duplicateOffice(
  sourceId: string,
  teamId: string,
  newName: string,
): Promise<OfficeListItem> {
  const { data: src, error: loadErr } = await supabase
    .from('offices')
    .select('payload')
    .eq('id', sourceId)
    .single()
  if (loadErr) throw loadErr
  const payload = (src as { payload: Record<string, unknown> | null } | null)?.payload ?? {}
  const { data, error } = await supabase
    .from('offices')
    .insert({
      team_id: teamId,
      name: newName,
      slug: slugFromName(newName),
      payload,
    })
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
