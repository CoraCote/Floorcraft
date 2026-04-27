import { Link } from 'react-router-dom'
import {
  Pencil,
  Users,
  Share2,
  Layers,
  MousePointer2,
  Presentation,
} from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { useMyTeams } from '../../lib/teams/useMyTeams'
import { FloorPlanHero } from './FloorPlanHero'
import { BrowserFrame } from './BrowserFrame'
import { FeatureCard } from './FeatureCard'
import { LandingNav } from './LandingNav'
import { LandingStats } from './LandingStats'
import { HowItWorks } from './HowItWorks'
import { LandingFooter } from './LandingFooter'

/**
 * Public landing page at `/`.
 *
 * Auth-gated CTA logic (preserved from earlier phases):
 *   - Signed out → Sign up / Log in.
 *   - Signed in, has teams → jump straight to the first team home.
 *   - Signed in, no teams yet → /dashboard, which itself redirects to
 *     /onboarding/team (via `DashboardRedirect` + `RequireTeam`).
 *
 * Visual direction: Linear-adjacent, indigo accent, no stock
 * photography — the product's own stylized floor plan is the hero
 * illustration. Wave 15A added a sticky top nav, micro-stat row under
 * the hero CTA, a three-step "How it works" explainer, a 2x3 feature
 * grid with subtle hover affordances, and a real column footer.
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
          className="px-8 py-3 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-blue-950/40 transition-all inline-block"
        >
          Open dashboard
        </Link>
      </div>
    ) : (
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/signup"
          className="px-6 py-3 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-blue-950/40 transition-all text-center"
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
      <LandingNav />

      {/* Hero */}
      <section
        aria-labelledby="hero-heading"
        className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-24 sm:pb-28 text-center"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500 dark:text-blue-400 mb-5">
          Workplace planning, reimagined
        </p>
        <h1
          id="hero-heading"
          className="text-4xl sm:text-6xl font-bold tracking-tight text-gray-900 dark:text-gray-100 mb-4"
        >
          Plan your office.
          <br />
          <span className="text-gray-500 dark:text-gray-400">Seat your team.</span>
        </h1>
        {/* Subheadline revision: the pre-polish version ("The
            floor-plan editor built for hybrid workplace teams.") read
            as a tagline without saying what a visitor gets. The new
            copy names the two endpoints of the workflow — draft in
            minutes, publish in an afternoon — which is the actual
            value prop for someone debating whether to click Start
            free. */}
        <p className="text-base sm:text-xl text-gray-500 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
          Draft a floor plan in minutes, seat your whole team by the afternoon, and share a
          living map with every stakeholder that needs it.
        </p>
        {primaryCta}

        <LandingStats />

        {/* Enlarged hero illustration inside a simulated browser
            chrome. The indigo glow sits behind the frame to lift it
            off the gradient background. */}
        <div className="relative mt-16 sm:mt-20 max-w-4xl mx-auto">
          <div
            aria-hidden="true"
            className="absolute inset-x-8 top-10 bottom-0 rounded-3xl bg-blue-400/20 dark:bg-blue-500/10 blur-3xl"
          />
          <div className="relative">
            <BrowserFrame>
              <FloorPlanHero />
            </BrowserFrame>
          </div>
        </div>
      </section>

      {/* Feature grid — expanded from 3 to 6 tiles (2x3 on desktop).
          Three originals kept verbatim so we don't regress the
          existing copy review; three new tiles cover the multi-floor,
          presence, and presentation capabilities that landed after
          the first-wave polish. */}
      <section
        aria-labelledby="features-heading"
        className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24"
      >
        <h2
          id="features-heading"
          className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center mb-10"
        >
          What you can do
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 md:gap-8">
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
          <FeatureCard
            icon={Layers}
            title="Orchestrate multiple floors"
            description="Stack floors into a single office and jump between them with keyboard shortcuts. Department colors roll up across every level."
          />
          <FeatureCard
            icon={MousePointer2}
            title="See teammates live"
            description="Presence cursors show who is viewing the plan right now, so planning meetings stay in the same pixel without a screen share."
          />
          <FeatureCard
            icon={Presentation}
            title="Present without switching tools"
            description="Full-screen presentation mode hides the editor chrome, so your floor plan fits straight into the next all-hands deck."
          />
        </div>
      </section>

      <HowItWorks />

      {/* Social-proof row — kept but tightened. Wider letter-spacing
          and a little more vertical breathing room makes the names
          feel like a logo strip rather than a tag dump. */}
      <section
        aria-labelledby="trusted-heading"
        className="max-w-4xl mx-auto px-4 sm:px-6 pb-20"
      >
        <h2
          id="trusted-heading"
          className="text-center text-xs uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 mb-6"
        >
          Trusted by teams at
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          {['Acme', 'Nimbus', 'Orbit', 'Lattice', 'Fielder'].map((name) => (
            <div
              key={name}
              className="grayscale h-10 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 font-semibold text-sm tracking-[0.15em] uppercase transition-colors"
            >
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* Secondary CTA band doubles as a pricing teaser — the
          #pricing anchor from the top nav lands here. A full pricing
          table would be overkill while the product is still
          "free for small teams". */}
      <section
        id="pricing"
        aria-labelledby="cta-heading"
        className="bg-gradient-to-r from-blue-600 to-indigo-700 scroll-mt-16"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200 mb-4">
            Free for teams up to 25
          </p>
          <h2
            id="cta-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3"
          >
            Start planning today.
          </h2>
          <p className="text-lg text-blue-100 mb-8">
            No credit card. Upgrade when your team outgrows the free tier.
          </p>
          <Link
            to="/signup"
            className="inline-block px-8 py-3 bg-white dark:bg-gray-900 text-blue-700 dark:text-blue-300 text-lg font-medium rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40 shadow-lg transition-all"
          >
            Create your first office
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
