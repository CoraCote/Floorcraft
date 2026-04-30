import { Navigate } from 'react-router-dom'
import { useMyTeams } from '../../lib/teams/useMyTeams'
import { RouteLoadingFallback } from '../ui/RouteLoadingFallback'

export function RequireTeam({ children }: { children: React.ReactNode }) {
  const teams = useMyTeams()
  if (teams === null) {
    return <RouteLoadingFallback />
  }
  if (teams.length === 0) {
    return <Navigate to="/onboarding/team" replace />
  }
  return <>{children}</>
}
