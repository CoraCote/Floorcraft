import { supabase } from './supabase'

export interface ShareToken {
  id: string
  office_id: string
  token: string
  created_at: string
  revoked_at: string | null
}

/**
 * Random 48-char hex token (24 bytes of crypto-random data). We don't
 * use UUIDs here because the token is a bearer credential — its sole
 * purpose is to be unguessable, and 192 bits of entropy is well past
 * what a UUIDv4's 122 bits buys.
 */
function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createShareToken(officeId: string): Promise<ShareToken> {
  const { data: userRes } = await supabase.auth.getUser()
  const createdBy = userRes.user?.id
  if (!createdBy) throw new Error('Not signed in')
  const row = {
    office_id: officeId,
    token: randomToken(),
    created_by: createdBy,
  }
  const { data, error } = await supabase
    .from('share_tokens')
    .insert(row)
    .select()
    .single()
  if (error) throw error
  return data as ShareToken
}

export async function listShareTokens(officeId: string): Promise<ShareToken[]> {
  const { data, error } = await supabase
    .from('share_tokens')
    .select('*')
    .eq('office_id', officeId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ShareToken[]
}

export async function revokeShareToken(id: string): Promise<void> {
  const { error } = await supabase
    .from('share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/**
 * Anon-callable resolver for a share-link landing page. Returns the
 * office_id only — callers load the office payload via a separate RLS-
 * gated SELECT (the `offices_public_via_share_token` policy).
 */
export async function resolveShareToken(token: string): Promise<{ officeId: string } | null> {
  const { data, error } = await supabase
    .from('share_tokens')
    .select('office_id, revoked_at')
    .eq('token', token)
    .maybeSingle()
  if (error || !data || data.revoked_at) return null
  return { officeId: (data as { office_id: string }).office_id }
}
