// deno-lint-ignore-file no-console
//
// Suspends or un-suspends a user, on behalf of a platform admin.
// The admin clicks Suspend/Unsuspend on AdminUserDetailPage; this
// function:
//
//   1. Verifies the caller is a platform admin (via the
//      is_current_user_platform_admin() RPC, gated by RLS).
//   2. Refuses if the caller is trying to suspend themselves.
//   3. Uses the service-role client to flip
//      `auth.users.banned_until` via auth.admin.updateUserById —
//      this is the load-bearing block (Supabase auth middleware
//      refuses the user's tokens once set).
//   4. Calls admin_set_user_suspension() to write our audit trail
//      columns + emit an audit_events row.
//
// On unsuspend, ban_duration: 'none' clears the ban.
//
// Required env (set as Supabase secrets):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

// ~100 years — Supabase has no "permanent" option on ban_duration,
// so we pick a duration well past any practical session lifetime.
// Unsuspend uses the literal 'none' to clear it.
const BAN_FOREVER = '876000h'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: CORS_HEADERS,
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await userClient.auth.getUser()
  if (!userData?.user) return json({ error: 'unauthorized' }, 401)

  const { data: isAdmin, error: roleErr } = await userClient.rpc(
    'is_current_user_platform_admin',
  )
  if (roleErr || !isAdmin) {
    return json({ error: 'forbidden' }, 403)
  }

  let body: { user_id?: string; suspended?: boolean; reason?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const targetId = body.user_id
  const suspended = body.suspended
  const reason = body.reason ?? null
  if (!targetId || typeof suspended !== 'boolean') {
    return json({ error: 'user_id_and_suspended_required' }, 400)
  }
  if (targetId === userData.user.id) {
    return json({ error: 'cannot_suspend_self' }, 400)
  }

  // Flip the auth ban first — this is the actual block. If we wrote
  // our own columns first and this failed, profiles would say
  // "suspended" but the user could still sign in.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: banErr } = await adminClient.auth.admin.updateUserById(
    targetId,
    { ban_duration: suspended ? BAN_FOREVER : 'none' },
  )
  if (banErr) {
    console.error('[admin-suspend-user] ban update failed', banErr)
    return json({ error: banErr.message ?? 'ban_failed' }, 500)
  }

  // Write our own audit-trail columns + audit_events row. If this
  // fails after the ban flipped, surface the error — the caller
  // can retry; the auth ban is idempotent.
  const { error: rpcErr } = await userClient.rpc('admin_set_user_suspension', {
    p_user_id: targetId,
    p_suspended: suspended,
    p_reason: reason,
  })
  if (rpcErr) {
    console.error('[admin-suspend-user] profile update failed', rpcErr)
    return json({ error: rpcErr.message ?? 'profile_update_failed' }, 500)
  }

  return json({ ok: true, suspended })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}
