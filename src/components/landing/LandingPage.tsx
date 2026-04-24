import { Link } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { useMyTeams } from '../../lib/teams/useMyTeams'

/**
 * Public landing page at `/`.
 *
 * Phase 6 collapsed the "create an office right here from a template"
 * flow — pre-auth, there's no server-side team to attach a new office
 * to, so the CTA now routes into the auth funnel:
 *
 *   - Signed out → Sign up / Log in.
 *   - Signed in, has teams → jump straight to the first team home.
 *   - Signed in, no teams yet → /dashboard, which itself redirects to
 *     /onboarding/team (via `DashboardRedirect` + `RequireTeam`).
 *
 * Templates are intentionally dropped from the hero for now. The
 * product direction is to pick a template from the "Create office" modal
 * inside a team, not from a public page; keeping the old template tiles
 * here would invite users into a flow that no longer exists.
 */
export function LandingPage() {
  const session = useSession()
  const teams = useMyTeams()

  const primaryCta =
    session.status === 'authenticated' ? (
      <Link
        to={teams && teams.length > 0 ? `/t/${teams[0].slug}` : '/dashboard'}
        className="px-8 py-3 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all inline-block"
      >
        Open dashboard
      </Link>
    ) : (
      <div className="flex gap-3 justify-center">
        <Link
          to="/signup"
          className="px-6 py-3 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
        >
          Sign up
        </Link>
        <Link
          to="/login"
          className="px-6 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 text-lg"
        >
          Log in
        </Link>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">Floorcraft</h1>
        <p className="text-xl text-gray-500 mb-8 max-w-2xl mx-auto">
          Plan your office layout, manage employee seating, and track space
          utilization. All in one interactive tool.
        </p>
        {primaryCta}
      </div>

      {/* Value props — replaces the old template grid. These surface the
          three things that differentiate Floorcraft from a whiteboard +
          spreadsheet workflow. */}
      <div className="max-w-4xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="rounded-xl border border-gray-200 p-5 bg-white">
            <h2 className="font-semibold text-gray-800">Draw your space</h2>
            <p className="text-sm text-gray-500 mt-1">
              Walls, doors, rooms, furniture — snapping + measurements built in.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 p-5 bg-white">
            <h2 className="font-semibold text-gray-800">Seat the team</h2>
            <p className="text-sm text-gray-500 mt-1">
              Import a roster, assign seats, track who's in on which days.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 p-5 bg-white">
            <h2 className="font-semibold text-gray-800">Share with your org</h2>
            <p className="text-sm text-gray-500 mt-1">
              Invite teammates, mark views private, keep a live office plan.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-6 text-center text-sm text-gray-400">
        Floorcraft — Office layout & seat management
        <span className="mx-2">·</span>
        <Link to="/help" className="hover:text-blue-600">
          User guide &amp; FAQ
        </Link>
      </div>
    </div>
  )
}
