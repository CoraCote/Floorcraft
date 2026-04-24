import { Link } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { useMyTeams } from '../../lib/teams/useMyTeams'
import { FloorPlanHero } from './FloorPlanHero'

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

  // CTA renders as a flex row on sm+ but stacks vertically on mobile so
  // the two buttons each land above the fold on a narrow viewport.
  const primaryCta =
    session.status === 'authenticated' ? (
      <div className="flex justify-center">
        <Link
          to={teams && teams.length > 0 ? `/t/${teams[0].slug}` : '/dashboard'}
          className="px-8 py-3 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all inline-block"
        >
          Open dashboard
        </Link>
      </div>
    ) : (
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/signup"
          className="px-6 py-3 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all text-center"
        >
          Sign up
        </Link>
        <Link
          to="/login"
          className="px-6 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 text-lg text-center"
        >
          Log in
        </Link>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 py-12 sm:py-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
          Floorcraft
        </h1>
        <p className="text-base sm:text-xl text-gray-500 mb-8 max-w-2xl mx-auto">
          Plan your office layout, manage employee seating, and track space
          utilization. All in one interactive tool.
        </p>
        {primaryCta}

        {/* Product visualization — a stylized mini floor plan that
            previews what you'll actually build inside the editor. */}
        <div className="mt-10 sm:mt-14 max-w-3xl mx-auto">
          <FloorPlanHero />
        </div>
      </div>

      {/* Social-proof row */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        <div className="text-center text-xs uppercase tracking-wider text-gray-400 mb-4">
          Trusted by teams at
        </div>
        {/* Placeholder company wordmarks — swap with real customer logos. */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          {['Acme', 'Nimbus', 'Orbit', 'Lattice', 'Fielder'].map((name) => (
            <div
              key={name}
              className="grayscale h-12 flex items-center justify-center rounded-md border border-gray-100 bg-white/50 text-gray-400 hover:text-gray-500 font-semibold text-lg tracking-wider transition-colors"
            >
              {name}
            </div>
          ))}
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
