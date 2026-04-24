import { Link } from 'react-router-dom'
import { Pencil, Users, Share2 } from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { useMyTeams } from '../../lib/teams/useMyTeams'
import { FloorPlanHero } from './FloorPlanHero'
import { BrowserFrame } from './BrowserFrame'
import { FeatureCard } from './FeatureCard'
import { ThemeToggle } from '../ui/ThemeToggle'

/**
 * Public landing page at `/`.
 *
 * Auth-gated CTA logic (preserved from earlier phases):
 *   - Signed out → Sign up / Log in.
 *   - Signed in, has teams → jump straight to the first team home.
 *   - Signed in, no teams yet → /dashboard, which itself redirects to
 *     /onboarding/team (via `DashboardRedirect` + `RequireTeam`).
 *
 * Visual direction: Linear-adjacent, light-theme-only, indigo accent,
 * no stock photography — the product's own stylized floor plan is the
 * hero illustration.
 */
export function LandingPage() {
  const session = useSession()
  const teams = useMyTeams()

  // The CTA row stacks on mobile so each button lands above the fold
  // on 375px viewports. Authenticated users see a single "Open
  // dashboard" pill instead of the sign-up split.
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
          Start free
        </Link>
        <Link
          to="/help"
          className="px-6 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800/50 text-lg text-center"
        >
          See a demo
        </Link>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Theme toggle pinned top-right; absolute so it doesn't push the
          hero down on small screens. */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500 dark:text-blue-400 mb-5">
          Workplace planning, reimagined
        </p>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-gray-900 dark:text-gray-100 mb-4">
          Plan your office.
          <br />
          <span className="text-gray-500 dark:text-gray-400">Seat your team.</span>
        </h1>
        <p className="text-xl text-gray-500 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
          The floor-plan editor built for hybrid workplace teams.
        </p>
        {primaryCta}

        {/* Enlarged hero illustration inside a simulated browser
            chrome. The indigo glow sits behind the frame to lift it
            off the gradient background. */}
        <div className="relative mt-16 sm:mt-20 max-w-4xl mx-auto">
          <div
            aria-hidden="true"
            className="absolute inset-x-8 top-10 bottom-0 rounded-3xl bg-blue-400/20 blur-3xl"
          />
          <div className="relative">
            <BrowserFrame>
              <FloorPlanHero />
            </BrowserFrame>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-5xl mx-auto px-6 pb-20 sm:pb-24">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center mb-10">
          What you can do
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
          <FeatureCard
            icon={Pencil}
            title="Draw in minutes"
            description="Drop walls, desks, and rooms on an infinite canvas. Snap-to-grid keeps everything clean without fighting alignment."
          />
          <FeatureCard
            icon={Users}
            title="Assign the whole team"
            description="Drag employees onto seats, or import from CSV. Color-coded neighborhoods make it obvious who sits where."
          />
          <FeatureCard
            icon={Share2}
            title="Share a living plan"
            description="One-click view-only links for stakeholders. Presentation mode for the all-hands."
          />
        </div>
      </section>

      {/* Social-proof row */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <p className="text-center text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-4">
          Trusted by teams at
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          {['Acme', 'Nimbus', 'Orbit', 'Lattice', 'Fielder'].map((name) => (
            <div
              key={name}
              className="grayscale h-10 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300 font-semibold text-sm tracking-wider transition-colors"
            >
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* Secondary CTA band */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700">
        <div className="max-w-4xl mx-auto px-6 py-16 sm:py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3">
            Start planning today.
          </h2>
          <p className="text-lg text-blue-100 mb-8">
            Free for small teams. No credit card.
          </p>
          <Link
            to="/signup"
            className="inline-block px-8 py-3 bg-white dark:bg-gray-900 text-blue-700 dark:text-blue-300 text-lg font-medium rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 shadow-lg transition-all"
          >
            Create your first office
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-gray-800 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
        Floorcraft — Office layout &amp; seat management
        <span className="mx-2">·</span>
        <Link to="/help" className="hover:text-blue-600 dark:hover:text-blue-400">
          User guide &amp; FAQ
        </Link>
      </footer>
    </div>
  )
}
