import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
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
 * Wave 17A: forgot-password picks up the same gradient + card chrome
 * as the rest of the auth suite. The success branch now renders a
 * proper confirmation panel (green check, "Check your inbox",
 * expiry hint, resend fallback) instead of a bare paragraph.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submitReset(targetEmail: string) {
    setBusy(true)
    setError(null)
    let err: unknown = null
    try {
      const res = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/auth/reset`,
      })
      err = res.error
    } catch (e) {
      err = e
    }
    setBusy(false)
    if (err) {
      setError(humanizeAuthError(err))
      return false
    }
    return true
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const ok = await submitReset(email)
    if (ok) setDone(true)
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
            We sent a reset link to{' '}
            <span className="font-medium text-gray-700 dark:text-gray-200">{email}</span>.
            It expires in 1 hour.
          </p>
          <div className="mt-6 w-full border-t border-gray-100 pt-5 text-sm dark:border-gray-800">
            <button
              type="button"
              onClick={() => void submitReset(email)}
              disabled={busy}
              className="text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline dark:text-blue-400"
            >
              {busy ? 'Sending…' : "Didn't get it? Resend"}
            </button>
          </div>
          <div className="mt-4 text-xs">
            <Link
              to="/login"
              className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Reset your password"
        subtitle="We'll email you a link to set a new one."
      />

      {error && <AuthErrorBanner id="forgot-form-error" message={error} />}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FieldLabel htmlFor="forgot-email" label="Email">
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={!!error}
            aria-describedby={error ? 'forgot-form-error' : undefined}
          />
        </FieldLabel>

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
          {busy ? 'Sending reset link…' : 'Send reset link'}
        </Button>
      </form>

      <AuthLinks>
        <Link
          to="/login"
          className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
        >
          Back to sign in
        </Link>
        <span className="text-gray-400 dark:text-gray-600">
          Need an account?{' '}
          <Link
            to="/signup"
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Sign up
          </Link>
        </span>
      </AuthLinks>
    </AuthShell>
  )
}
