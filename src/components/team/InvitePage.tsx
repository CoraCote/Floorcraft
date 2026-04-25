import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, Link } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'
import { humanizeError } from '../../lib/errorMessages'
import { previewInvite, type InvitePreview } from '../../lib/invitePreview'
import { Button } from '../ui'

/**
 * Wave 17C: branded invite landing page. The route fires before auth
 * (see the unauthenticated branch below), previews the inviter + team
 * via a security-definer RPC, and — once the user is signed in — lets
 * them accept with a single click.
 *
 * Polish: full-height gradient bg matching the auth/landing pages; a
 * card with the Floorcraft wordmark, a clear "X invited you to Y"
 * headline, inviter attribution, a styled role pill, and primary
 * "Accept & join" + secondary "Decline" buttons. Decline surfaces a
 * muted confirmation state rather than closing the tab, so the user
 * isn't left wondering what happened.
 *
 * The accept flow is unchanged — it still round-trips through
 * `accept_invite` RPC and navigates to the team home on success.
 */

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const session = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const [declined, setDeclined] = useState(false)

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

  if (!token) {
    return (
      <InviteShell>
        <InviteErrorCard
          title="Invalid invite link"
          body="This URL is missing its invite token."
        />
      </InviteShell>
    )
  }

  if (session.status === 'loading') {
    return (
      <InviteShell>
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      </InviteShell>
    )
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

  if (declined) {
    return (
      <InviteShell>
        <InviteErrorCard
          title="Invitation declined"
          body="You can close this tab. If this was a mistake, ask your inviter for a fresh link."
        />
      </InviteShell>
    )
  }

  if (inviteInvalid) {
    return (
      <InviteShell>
        <InviteErrorCard
          title="This invite isn't valid anymore"
          body="It may have expired, been revoked, or already been accepted. Ask your inviter for a fresh link."
        />
      </InviteShell>
    )
  }

  return (
    <InviteShell>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {preview ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              You've been invited to join{' '}
              <span className="text-blue-600 dark:text-blue-400">
                {preview.teamName}
              </span>
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Invited by <strong>{preview.inviterName}</strong>
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <Shield size={10} aria-hidden="true" />
                Member
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Access to every office in this team
              </span>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Loading invite…
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Fetching the team and inviter details.
            </p>
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col sm:flex-row-reverse gap-2">
          <Button
            variant="primary"
            onClick={accept}
            disabled={busy || inviteInvalid}
            className="w-full sm:w-auto justify-center"
          >
            {busy ? 'Joining…' : 'Accept invite'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setDeclined(true)}
            disabled={busy}
            className="w-full sm:w-auto justify-center"
          >
            Decline
          </Button>
        </div>
      </div>
    </InviteShell>
  )
}

/**
 * Shared chrome: gradient background + centered card + Floorcraft
 * wordmark at the top. Keeps the invite page visually consistent with
 * the landing page and auth pages, which this user may have just come
 * from (or be about to bounce through on the signup round-trip).
 */
function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900 flex flex-col items-center justify-center px-6 py-10">
      <Link
        to="/"
        className="mb-6 flex items-center gap-2 font-semibold tracking-tight text-gray-900 dark:text-gray-100"
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-5 rotate-45 rounded-sm bg-gradient-to-br from-blue-500 to-indigo-600"
        />
        <span>Floorcraft</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

function InviteErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900 text-center">
      <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{body}</p>
      <div className="mt-5">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          Go to Floorcraft home
        </Link>
      </div>
    </div>
  )
}
