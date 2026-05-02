import { supabase } from './supabase'

export interface AdminTeamRow {
  id: string
  slug: string
  name: string
  created_at: string
  member_count: number
  office_count: number
}

export interface AdminUserRow {
  id: string
  email: string
  name: string | null
  created_at: string
  is_platform_admin: boolean
  team_count: number
}

/**
 * Admin-side enriched team list. Counts (members, offices) are
 * computed server-side via the `admin_list_teams` RPC so we make
 * one round trip instead of N+1.
 */
export async function adminListTeams(): Promise<AdminTeamRow[] | null> {
  const { data, error } = await supabase.rpc('admin_list_teams')
  if (error) {
    console.warn('[admin] list teams failed', error)
    return null
  }
  return (data ?? []) as AdminTeamRow[]
}

/**
 * Admin-side enriched user list. Same single-RPC shape; capped at
 * 200 rows by default (the RPC clamps the upper bound to 1000).
 */
export async function adminListUsers(limit = 200): Promise<AdminUserRow[] | null> {
  const { data, error } = await supabase.rpc('admin_list_users', { p_limit: limit })
  if (error) {
    console.warn('[admin] list users failed', error)
    return null
  }
  return (data ?? []) as AdminUserRow[]
}
