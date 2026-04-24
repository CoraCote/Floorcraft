import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ResendVerificationButton } from '../team/ResendVerificationButton'
import { humanizeAuthError } from '../../lib/auth/humanizeAuthError'

export function SignupPage() {
  const [params] = useSearchParams()
  // Invite tokens used to arrive as `?invite=<token>`, which put a
  // bearer credential into the browser history and referrer. InvitePage
  // now stashes the token in sessionStorage before redirecting here, so
  // the URL stays clean. We still honor the legacy query string in case
  // an older copy of a link is in someone's inbox — promote it into
  // sessionStorage and drop it from the URL.
  const legacyInvite = params.get('invite')
  if (legacyInvite) {
    sessionStorage.setItem('pending_invite_token', legacyInvite)
    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('invite')
    window.history.replaceState(
      window.history.state,
      '',
      cleanUrl.pathname + cleanUrl.search + cleanUrl.hash,
    )
  }
  const presetEmail = params.get('email') ?? ''

  const [name, setName] = useState('')
  const [email, setEmail] = useState(presetEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Invite token is already in sessionStorage at this point (see
    // the top-of-render promotion above). `/auth/verify` will consume
    // it after email confirmation.

    // Wrap in try/catch: `signUp` rejects on raw network failure rather
    // than returning `{ error }`, and the default exception is
    // `TypeError: Failed to fetch` — not a message we want pasted into
    // a user-facing form. humanizeAuthError rewrites that case.
    let error: unknown = null
    try {
      const res = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      })
      error = res.error
    } catch (e) {
      error = e
    }
    setBusy(false)
    if (error) {
      setError(humanizeAuthError(error))
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-6 rounded-lg shadow max-w-sm space-y-3 text-sm">
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="text-gray-600">
            We sent a verification link to <b>{email}</b>. Click the link to finish setting up your account.
          </p>
          <p className="text-xs text-gray-500">Didn't get the email? Check your spam folder or resend:</p>
          <ResendVerificationButton email={email} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Create your Floorcraft account</h1>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Name</span>
          <input
            required
            className="w-full border rounded px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'signup-form-error' : undefined}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Email</span>
          <input
            type="email"
            required
            readOnly={!!presetEmail}
            className="w-full border rounded px-2 py-1.5 disabled:bg-gray-50"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'signup-form-error' : undefined}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Password</span>
          <input
            type="password"
            required
            minLength={8}
            aria-describedby={
              error ? 'signup-form-error signup-password-hint' : 'signup-password-hint'
            }
            aria-invalid={!!error}
            className="w-full border rounded px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span
            id="signup-password-hint"
            className="mt-1 block text-xs text-gray-500"
          >
            At least 8 characters.
          </span>
        </label>
        {error && (
          <p
            id="signup-form-error"
            role="alert"
            className="text-xs text-red-600 mt-1"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <div className="text-xs text-gray-500 text-center">
          Already have an account? <Link to="/login" className="hover:underline">Log in</Link>
        </div>
      </form>
    </div>
  )
}
