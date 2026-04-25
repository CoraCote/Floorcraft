import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ResendVerificationButton } from '../team/ResendVerificationButton'
import { humanizeAuthError } from '../../lib/auth/humanizeAuthError'
import { Button, Input } from '../ui'
import {
  AuthShell,
  AuthHeading,
  AuthFieldLabel as FieldLabel,
  AuthErrorBanner,
  AuthLinks,
} from './AuthShell'

/**
 * Wave 17A: the signup page is the first surface a new user touches
 * after clicking "Start free" on the landing page, so the visual gap
 * was the most jarring of any auth screen. Copy refresh is meant to
 * match the landing page's confidence ("Create your workspace" lands
 * better than "Create your Floorcraft account" — the brand is already
 * on-screen via the wordmark above the card). Supabase call shape and
 * the invite-token promotion dance are untouched.
 */
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
      <AuthShell>
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400"
          >
            <CheckCircle2 size={24} />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Check your inbox
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            We sent a verification link to{' '}
            <span className="font-medium text-gray-700 dark:text-gray-200">{email}</span>.
            Click it to finish setting up your account.
          </p>
          <div className="mt-6 w-full border-t border-gray-100 pt-5 dark:border-gray-800">
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
              Didn't get the email? Check your spam folder or resend:
            </p>
            <ResendVerificationButton email={email} />
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Create your workspace"
        subtitle="Start planning your office in minutes. Free for small teams."
      />

      {error && <AuthErrorBanner id="signup-form-error" message={error} />}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FieldLabel htmlFor="signup-name" label="Name">
          <Input
            id="signup-name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            invalid={!!error}
            aria-describedby={error ? 'signup-form-error' : undefined}
          />
        </FieldLabel>

        <FieldLabel htmlFor="signup-email" label="Email">
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            readOnly={!!presetEmail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={!!error}
            aria-describedby={error ? 'signup-form-error' : undefined}
          />
        </FieldLabel>

        <div className="space-y-1.5">
          <label
            htmlFor="signup-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Password
          </label>
          <Input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!error}
            aria-describedby={
              error ? 'signup-form-error signup-password-hint' : 'signup-password-hint'
            }
          />
          <p
            id="signup-password-hint"
            className="text-xs text-gray-500 dark:text-gray-400"
          >
            8+ characters.
          </p>
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          className="w-full py-2"
          leftIcon={
            busy ? (
              <Loader2
                size={14}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : undefined
          }
        >
          {busy ? 'Creating account…' : 'Create account'}
        </Button>

        <p className="text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          By creating an account you agree to our{' '}
          <Link to="/help" className="underline hover:text-gray-700 dark:hover:text-gray-300">
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/help" className="underline hover:text-gray-700 dark:hover:text-gray-300">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <AuthLinks>
        <span />
        <span className="text-gray-400 dark:text-gray-600">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign in
          </Link>
        </span>
      </AuthLinks>
    </AuthShell>
  )
}
