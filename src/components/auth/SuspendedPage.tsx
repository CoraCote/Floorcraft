import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { AuthShell } from './AuthShell'

/**
 * Landing page a user is routed to when their sign-in fails because
 * their account is suspended (Supabase Auth's `banned_until` is set).
 * Without this page, a banned user would either:
 *   - See a raw "User is banned until …" error inline on the login
 *     form (alarming), or
 *   - Bounce silently to /login again on a refresh-token failure
 *     (mysterious).
 *
 * We deliberately don't surface the suspension *reason* here. Reading
 * it would require either a public unauthenticated lookup (which
 * leaks user existence) or letting the suspended user authenticate
 * (which the suspension is supposed to prevent). The reason is
 * recorded in the audit trail and visible to admins; the user's
 * recourse is to contact their administrator out of band.
 */
export function SuspendedPage() {
  return (
    <AuthShell documentTitle="Account suspended">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
          <ShieldAlert size={22} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Your account is suspended
        </h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          A platform administrator has temporarily blocked sign-in for
          your account. Your data and team memberships are preserved
          and will be available again if the suspension is lifted.
        </p>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          If this looks wrong, please contact whoever manages your
          Floorcraft account at your organisation. They can reach a
          platform admin to review the decision.
        </p>
        <div className="mt-6 flex flex-col gap-2 w-full">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md border border-[color:var(--color-paper-line)] dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
