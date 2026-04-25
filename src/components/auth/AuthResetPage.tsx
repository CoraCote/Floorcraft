import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { humanizeAuthError } from '../../lib/auth/humanizeAuthError'
import { useToastStore } from '../../stores/toastStore'
import { Button, Input } from '../ui'
import {
  AuthShell,
  AuthHeading,
  AuthFieldLabel as FieldLabel,
  AuthErrorBanner,
} from './AuthShell'

/**
 * Wave 17A: the password-reset page now runs under the same chrome as
 * sign-in and sign-up, and adds a confirm-password field to catch
 * typos before they lock the user out of their new credential. On
 * success we route to `/login` with a success toast — the Supabase
 * updateUser call leaves the session in a half-authenticated state
 * that the login page reconciles properly.
 */
export function AuthResetPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const pushToast = useToastStore((s) => s.push)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    // Client-side mismatch guard — hit this before the Supabase round
    // trip so the user gets instant feedback on a typo.
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setBusy(true)
    setError(null)
    let err: unknown = null
    try {
      const res = await supabase.auth.updateUser({ password })
      err = res.error
    } catch (e) {
      err = e
    }
    setBusy(false)
    if (err) {
      setError(humanizeAuthError(err))
      return
    }
    pushToast({
      tone: 'success',
      title: 'Password updated',
      body: 'Sign in with your new password.',
    })
    navigate('/login', { replace: true })
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Choose a new password"
        subtitle="Your old one is now inactive."
      />

      {error && <AuthErrorBanner id="reset-form-error" message={error} />}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label
            htmlFor="reset-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            New password
          </label>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!error}
            aria-describedby={
              error ? 'reset-form-error reset-password-hint' : 'reset-password-hint'
            }
          />
          <p
            id="reset-password-hint"
            className="text-xs text-gray-500 dark:text-gray-400"
          >
            8+ characters.
          </p>
        </div>

        <FieldLabel htmlFor="reset-password-confirm" label="Confirm new password">
          <Input
            id="reset-password-confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            invalid={!!error}
            aria-describedby={error ? 'reset-form-error' : undefined}
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
          {busy ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  )
}
