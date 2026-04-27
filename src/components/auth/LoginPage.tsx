import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { humanizeAuthError } from '../../lib/auth/humanizeAuthError'
import { Button, Input } from '../ui'
import {
  AuthShell,
  AuthHeading,
  AuthFieldLabel,
  AuthErrorBanner,
  AuthLinks,
} from './AuthShell'

/**
 * Wave 17A: login gets the same Linear/JSON-Crack idiom the rest of the
 * app moved to — gradient bg, centered card, wordmark at the top, and a
 * confident copy refresh ("Welcome back" beats the generic "Log in to
 * Floorcraft"). The form shape and supabase call are unchanged; only
 * presentation moves.
 */
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/dashboard'
  const emailRef = useRef<HTMLInputElement>(null)

  // Autofocus email on mount — this is the page's only primary action,
  // so planting the caret here saves a tab for the common path.
  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // signInWithPassword rejects (rather than returning `{ error }`) when
    // the network request itself fails, so we catch here as well as
    // handling the server-side `{ error }` return — otherwise a raw
    // `TypeError: Failed to fetch` leaks into the form.
    let error: unknown = null
    try {
      const res = await supabase.auth.signInWithPassword({ email, password })
      error = res.error
    } catch (e) {
      error = e
    }
    setBusy(false)
    if (error) {
      setError(humanizeAuthError(error))
      return
    }
    navigate(next, { replace: true })
  }

  return (
    <AuthShell>
      <AuthHeading title="Welcome back" subtitle="Sign in to your workspace." />

      {error && <AuthErrorBanner id="login-form-error" message={error} />}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <AuthFieldLabel htmlFor="login-email" label="Email">
          <Input
            id="login-email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={!!error}
            aria-describedby={error ? 'login-form-error' : undefined}
          />
        </AuthFieldLabel>

        <AuthFieldLabel htmlFor="login-password" label="Password">
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!error}
            aria-describedby={error ? 'login-form-error' : undefined}
          />
        </AuthFieldLabel>

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
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <AuthLinks>
        <Link
          to="/forgot"
          className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
        >
          Forgot password?
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
