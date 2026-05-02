import { supabase } from './supabase'

export interface AdminTeamRow {
  id: string
  slug: string
  name: string
  created_at: string
  member_count: number
  office_count: number
  /** Migration 0023 adds these. Optional so older projects (RPC
   *  not yet updated) keep compiling at the call site — a `null`
   *  / `undefined` means "we don't know" and the UI hides the
   *  related affordance. */
  is_suspended?: boolean
  last_activity_at?: string | null
}

export interface AdminUserRow {
  id: string
  email: string
  name: string | null
  created_at: string
  is_platform_admin: boolean
  team_count: number
  /** Migration 0030. Optional so older projects (RPC not yet
   *  updated) keep compiling — undefined means "we don't know"
   *  and the UI hides the Suspended badge / filter. */
  suspended_at?: string | null
  /** Migration 0031. Optional for the same reason. Null = the user
   *  has never signed in (still possible for invitee-only accounts
   *  that haven't accepted yet). */
  last_sign_in_at?: string | null
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
