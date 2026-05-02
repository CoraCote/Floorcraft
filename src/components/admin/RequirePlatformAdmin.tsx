import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useIsPlatformAdmin } from '../../lib/platformAdmin'
import { useSession } from '../../lib/auth/AuthProvider'

/**
 * Route gate for /admin/* surfaces. Renders children only when the
 * authenticated user has `is_platform_admin = true`. Anyone else gets
 * a 404-style redirect — distinct from team-admin gating
 * (`useCan('viewAuditLog')` etc.), which is per-team. Platform admin
 * is a service-wide role.
 *
 * Loading states are explicit:
 *   - `null` from the hook means the check hasn't returned yet → we
 *     render a tiny placeholder rather than flashing the redirect.
 *   - Unauthenticated session → redirect to /login (the standard
 *     surface; the RequireAuth wrapper handles this for the rest of
 *     the app, but we re-implement here to keep this gate
 *     self-contained).
 */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const session = useSession()
  const isAdmin = useIsPlatformAdmin()

  if (session.status === 'loading') {
    return <div className="p-8 text-sm text-gray-500 dark:text-gray-400">Checking session…</div>
  }
  if (session.status !== 'authenticated') {
    return <Navigate to="/login" replace />
  }
  if (isAdmin === null) {
    return <div className="p-8 text-sm text-gray-500 dark:text-gray-400">Checking access…</div>
  }
  if (!isAdmin) {
    // Mirror the unauth experience — don't leak the existence of the
    // admin surface to non-admins.
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}
