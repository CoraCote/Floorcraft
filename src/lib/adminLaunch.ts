import { supabase } from './supabase'

/**
 * Helpers for the launch-wave admin RPCs (migration 0022).
 *
 * Each helper round-trips a SECURITY DEFINER RPC gated by
 * `is_current_user_platform_admin()`. A non-admin caller gets a
 * `forbidden` exception which we surface to the UI as a generic
 * "could not load" — the page already gates behind
 * `RequirePlatformAdmin`, so this is belt-and-suspenders.
 */

export interface PlatformAuditRow {
  id: string
  team_id: string | null
  team_slug: string | null
  team_name: string | null
  actor_id: string | null
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface PlatformAuditOpts {
  limit?: number
  since?: string
  action?: string
  actorId?: string
}

export async function adminListPlatformAudit(
  opts: PlatformAuditOpts = {},
): Promise<PlatformAuditRow[] | null> {
  const { data, error } = await supabase.rpc('admin_list_platform_audit', {
    p_limit: opts.limit ?? 100,
    p_since: opts.since ?? null,
    p_action: opts.action ?? null,
    p_actor_id: opts.actorId ?? null,
  })
  if (error) {
    console.warn('[admin-launch] platform audit failed', error)
    return null
  }
  return (data ?? []) as PlatformAuditRow[]
}

export interface TeamUsage {
  office_count: number
  archived_office_count: number
  payload_bytes: number
  member_count: number
  audit_event_count: number
  last_audit_at: string | null
  last_office_update_at: string | null
}

export async function adminTeamUsage(teamId: string): Promise<TeamUsage | null> {
  const { data, error } = await supabase.rpc('admin_team_usage', {
    p_team_id: teamId,
  })
  if (error) {
    console.warn('[admin-launch] team usage failed', error)
    return null
  }
  return data as TeamUsage
}

export async function adminDeleteTeam(
  teamId: string,
): Promise<{ kind: 'ok' } | { kind: 'error'; message: string }> {
  const { error } = await supabase.rpc('admin_delete_team', {
    p_team_id: teamId,
  })
  if (error) return { kind: 'error', message: error.message }
  return { kind: 'ok' }
}

export interface AdminTeamOffice {
  id: string
  slug: string
  name: string
  is_private: boolean
  archived_at: string | null
  updated_at: string
}

/**
 * Admin-side list of a single team's offices. Bypasses the
 * `offices_read` RLS policy (which gates by team membership) via a
 * SECURITY DEFINER RPC, so a platform admin can browse offices on
 * teams they're not a member of.
 *
 * Migration 0024. Best-effort: a project that hasn't applied it
 * returns null and the caller hides the card.
 */
export async function adminListTeamOffices(
  teamId: string,
): Promise<AdminTeamOffice[] | null> {
  const { data, error } = await supabase.rpc('admin_list_team_offices', {
    p_team_id: teamId,
  })
  if (error) {
    console.warn('[admin-launch] team offices failed', error)
    return null
  }
  return (data ?? []) as AdminTeamOffice[]
}
