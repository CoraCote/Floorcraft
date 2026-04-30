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
 * Anon-callable resolver for a share-link landing page. Routes through
 * the SECURITY DEFINER `resolve_share_token` RPC introduced in
 * migration 0012 — the prior implementation queried `share_tokens`
 * directly, which (under the migration-0011 policy) let anon callers
 * enumerate every live token. The RPC takes the token as input and
 * only ever returns the office row whose token matches; without the
 * token no rows leak.
 *
 * Returns the office record bundled with the resolution so the caller
 * doesn't need a follow-up `offices` fetch. The legacy `{ officeId }`
 * shape is preserved on the result so existing callers
 * (SharedProjectView) keep working without a signature change.
 */
export interface ResolvedShareToken {
  officeId: string
  office: {
    id: string
    team_id: string
    slug: string
    name: string
    is_private: boolean
    created_by: string
    payload: unknown
    updated_at: string
  }
}

export async function resolveShareToken(token: string): Promise<ResolvedShareToken | null> {
  const { data, error } = await supabase
    .rpc('resolve_share_token', { p_token: token })
    .maybeSingle()
  if (error || !data) return null
  // The RPC returns a single row with column aliases matching the SQL
  // `returns table (...)` declaration. Project it onto the existing
  // {officeId, office} shape so the downstream typing is stable.
  const row = data as {
    office_id: string
    team_id: string
    slug: string
    name: string
    is_private: boolean
    created_by: string
    payload: unknown
    updated_at: string
  }
  return {
    officeId: row.office_id,
    office: {
      id: row.office_id,
      team_id: row.team_id,
      slug: row.slug,
      name: row.name,
      is_private: row.is_private,
      created_by: row.created_by,
      payload: row.payload,
      updated_at: row.updated_at,
    },
  }
}
