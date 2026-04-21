// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://floorcraft.space'
const FROM_ADDRESS = Deno.env.get('INVITE_FROM') ?? 'invites@floorcraft.space'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Missing auth', { status: 401 })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const user = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const { token } = await req.json() as { token: string }
  if (!token) return new Response('Missing token', { status: 400 })

  // Load the invite with service role (we've authorized based on caller below).
  const { data: invite, error: inviteErr } = await admin
    .from('invites')
    .select('id, team_id, email, token, invited_by, teams(name), profiles!invites_invited_by_fkey(name, email)')
    .eq('token', token)
    .single()
  if (inviteErr || !invite) return new Response('Invite not found', { status: 404 })

  // Authorize: caller must be admin of invite.team_id.
  const { data: adminCheck } = await user
    .from('team_members')
    .select('role')
    .eq('team_id', invite.team_id)
    .eq('user_id', (await user.auth.getUser()).data.user?.id ?? '')
    .single()
  if (adminCheck?.role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const inviteUrl = `${APP_URL}/invite/${token}`
  const inviteWithRelations = invite as unknown as { teams?: { name?: string }; profiles?: { name?: string } }
  const teamName = inviteWithRelations.teams?.name ?? 'your team'
  const inviterName = inviteWithRelations.profiles?.name ?? 'A teammate'

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You've been invited to ${teamName} on Floorcraft</h2>
      <p>${inviterName} invited you to join <b>${teamName}</b>.</p>
      <p>
        <a href="${inviteUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
          Accept invite
        </a>
      </p>
      <p style="color:#555;font-size:12px">Or paste this link: ${inviteUrl}</p>
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
      subject: `${inviterName} invited you to ${teamName} on Floorcraft`,
      html,
    }),
  })

  if (!resendResp.ok) {
    const err = await resendResp.text()
    return new Response(`Email provider error: ${err}`, { status: 502 })
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
