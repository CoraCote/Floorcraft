import { supabase } from './supabase'

export interface InvitePreview {
  teamName: string
  inviterName: string
}

/**
 * Fetches the team + inviter display names for a pending invite token.
 * Returns null if the token is invalid, expired, or already accepted —
 * we don't distinguish between the cases because the UI needs the same
 * "this link isn't valid anymore" message for all of them (and telling
 * strangers which state an invite is in leaks info).
 */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  // Defensive destructure: some test mocks return `undefined` from
  // `.rpc(...)`. Treat "no response envelope" the same as "no match".
  const res = await supabase.rpc('preview_invite', { invite_token: token })
  if (!res) return null
  const { data, error } = res
  if (error || !data || data.length === 0) return null
  const row = data[0]
  return { teamName: row.team_name, inviterName: row.inviter_name }
}
