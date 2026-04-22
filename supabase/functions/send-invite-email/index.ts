// deno-lint-ignore-file no-console
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://floorcraft.space'
const FROM_ADDRESS = Deno.env.get('INVITE_FROM') ?? 'invites@floorcraft.space'

// CORS preflight for browser callers. Supabase Functions sit on a
// different origin (`*.functions.supabase.co`) than the app, so
// Browsers will preflight any JSON POST. Must allow the auth + content
// headers the client actually sends.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

// Per-sender rate cap. 10 invite emails per 10 minutes is enough for
// a legitimate admin seeding a new team (we already support copy-link
// fallback when mail is throttled). Abuse vectors we block:
//   1. A compromised admin token looping the endpoint and burning the
//      sending domain.
//   2. A malicious admin on a free team spamming random inboxes.
// Storage is a Postgres table because edge-function instances have no
// shared memory — an in-process bucket would re-arm on cold-start.
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 600

function escapeHtml(s: string): string {
  // Minimal HTML escape for values that land inside element bodies or
  // attribute values rendered by the recipient's mail client. We do
  // not trust Resend (or downstream clients) to sanitize; a team whose
  // name is literally `</h2><script>` must not execute anywhere.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...(init?.headers ?? {}),
    },
  })
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: CORS_HEADERS })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') return textResponse('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return textResponse('Missing auth', 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  // Resolve the caller up front so every downstream check is positive
  // ("role === 'admin'") rather than the fragile negative form. If
  // auth.getUser() returns null the JWT is expired/invalid — bail.
  const { data: authData, error: authErr } = await userClient.auth.getUser()
  const caller = authData?.user
  if (authErr || !caller) return textResponse('Not authenticated', 401)

  let body: { token?: string }
  try {
    body = (await req.json()) as { token?: string }
  } catch {
    return textResponse('Invalid JSON', 400)
  }
  const token = body.token
  if (!token || typeof token !== 'string') return textResponse('Missing token', 400)

  // Rate limit BEFORE any DB lookup or send — cheapest failure path
  // possible for abuse traffic. `record_send_invite_email_call` is a
  // SECURITY DEFINER function that atomically counts + inserts and
  // returns the current window count. Fails closed if the function is
  // missing (migration not applied) — we reject rather than open the
  // endpoint up.
  const { data: rlCount, error: rlErr } = await admin.rpc(
    'record_send_invite_email_call',
    { p_user_id: caller.id, p_window_seconds: RATE_LIMIT_WINDOW_SECONDS },
  )
  if (rlErr) {
    console.error('rate_limit_rpc_failed', rlErr)
    return textResponse('Rate limit check failed', 500)
  }
  if (typeof rlCount === 'number' && rlCount > RATE_LIMIT_MAX) {
    return textResponse('Too many invite emails sent — try again in a few minutes.', 429)
  }

  // Load the invite with service role so RLS doesn't hide a join the
  // caller would otherwise need team membership to read. Authorization
  // is re-checked below using the caller's JWT.
  const { data: invite, error: inviteErr } = await admin
    .from('invites')
    .select(
      'id, team_id, email, token, invited_by, teams(name), profiles!invites_invited_by_fkey(name, email)',
    )
    .eq('token', token)
    .single()
  if (inviteErr || !invite) return textResponse('Invite not found', 404)

  // Authorize: caller must be admin of invite.team_id. Positive check.
  const { data: membership } = await userClient
    .from('team_members')
    .select('role')
    .eq('team_id', invite.team_id)
    .eq('user_id', caller.id)
    .single()
  if (!membership || membership.role !== 'admin') {
    return textResponse('Forbidden', 403)
  }

  const inviteUrl = `${APP_URL}/invite/${token}`
  // supabase-js `.select(... teams(name) ...)` types the join as
  // `Record<string, unknown>` because we didn't generate schema types
  // for the function. Narrow locally so the TS check stays strict.
  const joined = invite as unknown as {
    teams?: { name?: string | null } | null
    profiles?: { name?: string | null } | null
  }
  const rawTeamName = joined.teams?.name ?? 'your team'
  const rawInviterName = joined.profiles?.name ?? 'A teammate'
  const teamName = escapeHtml(rawTeamName)
  const inviterName = escapeHtml(rawInviterName)
  // The invite token is a uuid so URL-encoding is a no-op today, but
  // use encodeURI for defense-in-depth in case the token format ever
  // changes.
  const safeInviteUrl = encodeURI(inviteUrl)

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You've been invited to ${teamName} on Floorcraft</h2>
      <p>${inviterName} invited you to join <b>${teamName}</b>.</p>
      <p>
        <a href="${safeInviteUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
          Accept invite
        </a>
      </p>
      <p style="color:#555;font-size:12px">Or paste this link: ${safeInviteUrl}</p>
      <p style="color:#888;font-size:12px">This invite expires in 7 days.</p>
    </div>
  `

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [invite.email],
      // Subjects are plain text in SMTP — no HTML context — but we
      // still strip CRLF to prevent header injection on a hypothetical
      // mail relay that doesn't handle it.
      subject: `${rawInviterName.replace(/[\r\n]/g, ' ')} invited you to ${rawTeamName.replace(/[\r\n]/g, ' ')} on Floorcraft`,
      html,
    }),
  })

  if (!resendResp.ok) {
    const err = await resendResp.text()
    return textResponse(`Email provider error: ${err}`, 502)
  }
  return jsonResponse({ ok: true })
})
