import { Navigate } from 'react-router-dom'
import { useMyTeams } from '../../lib/teams/useMyTeams'

export function RequireTeam({ children }: { children: React.ReactNode }) {
  const teams = useMyTeams()
  if (teams === null) {
    return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading your teams…</div>
  }
  if (teams.length === 0) {
    return <Navigate to="/onboarding/team" replace />
  }
  return <>{children}</>
}
