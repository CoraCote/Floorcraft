import { Navigate } from 'react-router-dom'
import { useMyTeams } from '../../lib/teams/useMyTeams'

/**
 * Lands users on the right place after sign-in.
 *
 * The route tree mounts this behind `<RequireAuth><RequireTeam>`, so by
 * the time we render we know:
 *   - there is a signed-in user
 *   - they have access to at least one team (RequireTeam guarantees this,
 *     redirecting to /onboarding/team when they don't).
 *
 * We still handle the `teams === null` loading state here (useMyTeams
 * returns null until the first Supabase fetch resolves) so the user sees
 * a brief "Loading…" instead of a flash of empty state.
 *
 * Selection rule when the user is in multiple teams: pick the first one
 * in the list. `useMyTeams` orders by `created_at asc`, so that's the
 * team the user joined first — stable and predictable across sessions.
 * If we later want "last-visited team", the right place is a
 * `profiles.active_team_id` column, not here.
 */
export function DashboardRedirect() {
  const teams = useMyTeams()
  if (!teams) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
  if (teams.length === 0) return <Navigate to="/onboarding/team" replace />
  return <Navigate to={`/t/${teams[0].slug}`} replace />
}
