// deno-lint-ignore-file no-console
//
// Generates a password-recovery link for a user, on behalf of a
// platform admin. The admin clicks "Generate password reset" on
// AdminUserDetailPage; this function:
//
//   1. Verifies the caller is a platform admin (via the
//      is_current_user_platform_admin() RPC, gated by RLS).
//   2. Uses the service-role client to call
//      `auth.admin.generateLink({ type: 'recovery', email })`.
//   3. Returns the action_link to the caller.
//
// The link is then surfaced to the admin in the UI with a Copy
// button. The admin sends it to the user out-of-band (Slack,
// email, support ticket). This is the standard "support tool"
// shape — Supabase's `generateLink` doesn't auto-email, and
// invoking the public reset flow requires the user themselves.
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

  // Caller-scoped client for the role check — runs through RLS
  // with the caller's JWT, so a non-admin gets `is_current_user_
  // platform_admin() = false` and we refuse.
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

  // Parse + validate body. We accept either { email } directly or
  // { user_id } — the admin UI passes user_id; an internal tool
  // could pass email. Resolve user_id → email via the profiles
  // table (RLS bypassed for SECURITY DEFINER on the lookup, but
  // we use the service role client here anyway).
  let body: { email?: string; user_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  let email = body.email
  if (!email && body.user_id) {
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('email')
      .eq('id', body.user_id)
      .maybeSingle()
    if (profileErr || !profile) {
      return json({ error: 'user_not_found' }, 404)
    }
    email = (profile as { email: string }).email
  }
  if (!email) {
    return json({ error: 'email_required' }, 400)
  }

  // Service-role admin client — required to call auth.admin.*.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'recovery',
    email,
  })
  if (linkErr) {
    console.error('[admin-password-reset] generateLink failed', linkErr)
    return json({ error: linkErr.message ?? 'generate_link_failed' }, 500)
  }

  const actionLink = linkData?.properties?.action_link
  if (!actionLink) {
    return json({ error: 'no_action_link' }, 500)
  }

  return json({ action_link: actionLink, email })
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
