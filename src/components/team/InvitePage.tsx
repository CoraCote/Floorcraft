import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'
import { humanizeError } from '../../lib/errorMessages'
import { previewInvite, type InvitePreview } from '../../lib/invitePreview'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const session = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [previewLoaded, setPreviewLoaded] = useState(false)

  // Fire the preview fetch as soon as we have a token, regardless of
  // auth state. The preview RPC is `security definer` and callable by
  // anon — the goal is to greet the user with "Sarah invited you to
  // Acme" before they bounce through /signup, so the previewed name
  // shows up on their return trip to /invite/:token too.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    previewInvite(token).then((p) => {
      if (!cancelled) {
        setPreview(p)
        setPreviewLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [token])

  if (!token) return <div className="p-6 text-sm">Invalid invite link.</div>

  if (session.status === 'loading') {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>
  }

  if (session.status === 'unauthenticated') {
    // Stash the token in sessionStorage and redirect to /signup without
    // it in the URL. Invite tokens are 7-day bearer credentials — they
    // should not live in the address bar, browser history, or
    // `document.referrer` (which leaks to analytics and third-party
    // scripts loaded on /signup).
    sessionStorage.setItem('pending_invite_token', token)
    return <Navigate to="/signup" replace />
  }

  async function accept() {
    setBusy(true)
    setError(null)
    const { data: teamId, error: rpcError } = await supabase.rpc('accept_invite', { invite_token: token })
    if (rpcError) {
      // Surface `raise exception 'invite_expired'` etc. as readable
      // sentences rather than internal token strings.
      setError(humanizeError(rpcError))
      setBusy(false)
      return
    }
    const { data: team } = await supabase.from('teams').select('slug').eq('id', teamId).single()
    navigate(`/t/${team?.slug ?? ''}`, { replace: true })
  }

  // Once the preview fetch returns null we know the token is invalid —
  // keep the Accept button disabled to avoid a pointless RPC round-trip
  // that'll just surface a generic error.
  const inviteInvalid = previewLoaded && !preview

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-6 rounded-lg shadow max-w-sm space-y-3 text-sm">
        {preview ? (
          <>
            <h1 className="text-lg font-semibold">
              {preview.inviterName} invited you to {preview.teamName}
            </h1>
            <p className="text-gray-600">Accept to join this workspace on Floorcraft.</p>
          </>
        ) : previewLoaded ? (
          <>
            <h1 className="text-lg font-semibold">Invite link not valid</h1>
            <p className="text-gray-600">
              This invite may be expired or already used. Ask your inviter for a fresh link.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Loading invite…</h1>
          </>
        )}
        {error && <p className="text-red-600">{error}</p>}
        <button
          onClick={accept}
          disabled={busy || inviteInvalid}
          className="w-full bg-blue-600 text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {busy ? 'Joining…' : 'Accept invite'}
        </button>
      </div>
    </div>
  )
}
