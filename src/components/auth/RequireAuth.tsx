import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const location = useLocation()

  if (session.status === 'loading') {
    return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
  }
  if (session.status === 'unauthenticated') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <>{children}</>
}
