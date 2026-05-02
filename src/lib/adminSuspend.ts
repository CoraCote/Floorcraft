import { supabase } from './supabase'

export interface AdminTeamDetail {
  id: string
  slug: string
  name: string
  created_at: string
  is_suspended: boolean
  suspension_reason: string | null
  suspended_at: string | null
  suspended_by_email: string | null
  office_count: number
  members: Array<{
    user_id: string
    role: 'admin' | 'member'
    email: string
    name: string | null
    joined_at: string
  }>
}

export async function adminGetTeamDetail(
  teamId: string,
): Promise<AdminTeamDetail | null> {
  const { data, error } = await supabase.rpc('admin_get_team_detail', {
    p_team_id: teamId,
  })
  if (error) {
    console.warn('[admin] team detail failed', error)
    return null
  }
  return data as AdminTeamDetail
}

export async function adminSetTeamSuspended(args: {
  teamId: string
  suspended: boolean
  reason?: string
}): Promise<
  | { kind: 'ok' }
  | { kind: 'error'; reason: 'forbidden' | 'team_not_found' | 'unknown'; message: string }
> {
  const { error } = await supabase.rpc('admin_set_team_suspended', {
    p_team_id: args.teamId,
    p_suspended: args.suspended,
    p_reason: args.reason ?? null,
  })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('forbidden'))
      return { kind: 'error', reason: 'forbidden', message: 'Only platform admins can suspend teams.' }
    if (msg.includes('team_not_found'))
      return { kind: 'error', reason: 'team_not_found', message: 'Team no longer exists.' }
    return { kind: 'error', reason: 'unknown', message: msg || 'Something went wrong.' }
  }
  return { kind: 'ok' }
}
