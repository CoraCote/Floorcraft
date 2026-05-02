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

export interface AdminUserTeam {
  team_id: string
  team_name: string
  team_slug: string
  role: string
  joined_at: string
  is_suspended: boolean
}

export interface AdminUserDetail {
  id: string
  email: string
  name: string | null
  created_at: string
  is_platform_admin: boolean
  teams: AdminUserTeam[]
}

/**
 * Per-user detail for the admin user-detail page. Returns the
 * user's profile alongside every team they're a member of (with
 * role + joined-at + the team's suspension state).
 *
 * Migration 0025. Best-effort: pre-0025 projects return null.
 */
export async function adminGetUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  const { data, error } = await supabase.rpc('admin_get_user_detail', {
    p_user_id: userId,
  })
  if (error) {
    console.warn('[admin-launch] user detail failed', error)
    return null
  }
  return data as AdminUserDetail
}

export interface SignupHistogramPoint {
  day: string // YYYY-MM-DD
  count: number
}

/**
 * Per-day signup counts for the last N days, oldest first. Backs
 * the trend chart on AdminOverviewPage.
 *
 * Migration 0026. Best-effort: pre-0026 projects return null and
 * the chart is hidden.
 */
export async function adminSignupsHistogram(
  days = 30,
): Promise<SignupHistogramPoint[] | null> {
  const { data, error } = await supabase.rpc('admin_signups_histogram', {
    p_days: days,
  })
  if (error) {
    console.warn('[admin-launch] signups histogram failed', error)
    return null
  }
  return (data ?? []) as SignupHistogramPoint[]
}

/**
 * Generates a password-recovery link for `userId` and returns the
 * action URL. The admin pastes that URL to the user out-of-band
 * (Slack, email, support ticket); Supabase's `generateLink` does
 * not auto-send a recovery email, and the public reset flow
 * (`auth.resetPasswordForEmail`) requires the user themselves —
 * neither fits the admin-initiated reset shape.
 *
 * Goes through the `admin-send-password-reset` Edge Function which
 * gates on `is_current_user_platform_admin()` server-side and uses
 * the service role to call `auth.admin.generateLink`.
 */
export async function adminGeneratePasswordResetLink(
  userId: string,
): Promise<{ kind: 'ok'; actionLink: string; email: string } | { kind: 'error'; message: string }> {
  const session = await supabase.auth.getSession()
  const accessToken = session.data.session?.access_token
  if (!accessToken) return { kind: 'error', message: 'Not authenticated' }

  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base) return { kind: 'error', message: 'VITE_SUPABASE_URL is not set' }

  const url = new URL('/functions/v1/admin-send-password-reset', base)
  let res: Response
  try {
    res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId }),
    })
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : 'Network error',
    }
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return {
      kind: 'error',
      message: body.error ?? `Reset failed (${res.status})`,
    }
  }
  const body = (await res.json()) as { action_link: string; email: string }
  return { kind: 'ok', actionLink: body.action_link, email: body.email }
}
