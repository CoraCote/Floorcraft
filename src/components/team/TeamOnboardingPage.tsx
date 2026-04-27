import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { createTeam } from '../../lib/teams/teamRepository'
import { humanizeError } from '../../lib/errorMessages'
import { Button, Input } from '../ui'
import {
  AuthShell,
  AuthHeading,
  AuthFieldLabel,
  AuthErrorBanner,
} from '../auth/AuthShell'

/**
 * Wave 18A: bring the team-onboarding screen up to the auth-shell idiom
 * the rest of the post-signup funnel uses.
 *
 * A first-time user lands here right after verifying their email — it's
 * the third surface they ever see, sandwiched between the verification
 * page and their first dashboard. Pre-18A this was raw HTML on a flat
 * gray background with a plain `<h1 class="text-lg">` — visually
 * disconnected from the auth pages it follows. Reusing `AuthShell`
 * (Floorcraft wordmark + diamond mark + centered card on the same
 * gradient) closes that gap so the funnel reads as one product.
 *
 * The form shape is unchanged: a single team-name field plus a primary
 * action. We swap raw `<input>` / `<button>` for the UI-kit `Input` and
 * `Button` so focus rings, dark-mode pairing, and disabled states match
 * everywhere else. The submit button takes a `Loader2` left-icon while
 * busy — `motion-reduce:animate-none` honors the OS reduced-motion
 * preference without us reading the media query at runtime.
 *
 * Copy refresh: "Offices live inside a team. You can invite teammates
 * after." (matter-of-fact, drops the redundant "Offices you create").
 */
export function TeamOnboardingPage() {
  const session = useSession()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  if (session.status !== 'authenticated') return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (session.status !== 'authenticated') return
    setBusy(true)
    setError(null)
    try {
      const team = await createTeam(name)
      navigate(`/t/${team.slug}`, { replace: true })
    } catch (err) {
      setError(humanizeError(err))
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <AuthHeading
        title="Create your first team"
        subtitle="Offices live inside a team. You can invite teammates after."
      />

      {error && <AuthErrorBanner id="onboarding-form-error" message={error} />}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <AuthFieldLabel htmlFor="onboarding-team-name" label="Team name">
          <Input
            id="onboarding-team-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc"
            invalid={!!error}
            aria-describedby={error ? 'onboarding-form-error' : undefined}
          />
        </AuthFieldLabel>

        <Button
          type="submit"
          variant="primary"
          disabled={busy || !name.trim()}
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
          {busy ? 'Creating…' : 'Create team'}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
        Got an invite link?{' '}
        <Link
          to="/dashboard"
          className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Skip to dashboard
        </Link>
      </p>
    </AuthShell>
  )
}
