import { Link } from 'react-router-dom'
import {
  Pencil,
  Users,
  Share2,
  Layers,
  MousePointer2,
  Presentation,
  ArrowRight,
} from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { useMyTeams } from '../../lib/teams/useMyTeams'
import { FloorPlanHero } from './FloorPlanHero'
import { FeatureCard } from './FeatureCard'
import { LandingNav } from './LandingNav'
import { LandingStats } from './LandingStats'
import { HowItWorks } from './HowItWorks'
import { LandingFooter } from './LandingFooter'

/**
 * Public landing page at `/`.
 *
 * Wave 21A — Drafting Studio direction. Replaces the indigo-gradient
 * 2021-SaaS look with a warm-paper / blueprint-cyan identity that telegraphs
 * the product is a *spatial planning tool*, not a generic CRM. The hero
 * splits into a copy column and a technical-drawing column at lg+, with
 * mono numerics for measurements and stats and a faint blueprint grid
 * behind the hero. The "See a demo" CTA now points at `/demo`, a
 * read-only mount of the seed office that ships with the build.
 */
export function LandingPage() {
  const session = useSession()
  const teams = useMyTeams()

  const primaryCta =
    session.status === 'authenticated' ? (
      <div className="flex justify-center lg:justify-start">
        <Link
          to={teams && teams.length > 0 ? `/t/${teams[0].slug}` : '/dashboard'}
          className="group inline-flex items-center gap-2 px-6 py-3 bg-[color:var(--color-blueprint)] hover:bg-[color:var(--color-blueprint-strong)] text-white text-base font-medium rounded-lg transition-colors"
        >
          Open dashboard
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    ) : (
      <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
        <Link
          to="/signup"
          className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-[color:var(--color-blueprint)] hover:bg-[color:var(--color-blueprint-strong)] text-white text-base font-medium rounded-lg transition-colors"
        >
          Start free
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          to="/demo"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-[color:var(--color-paper-line)] dark:border-gray-700 rounded-lg text-base font-medium text-gray-800 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800/50 transition-colors"
        >
          Open the demo plan
        </Link>
      </div>
    )

  return (
    <div className="min-h-screen bg-[color:var(--color-paper)] text-gray-900 dark:text-gray-100">
      <LandingNav />

      {/* ───── Hero ─────
          Split layout at lg+: copy left, technical drawing right.
          A subtle blueprint grid washes across the entire hero band so
          the marketing surface and the editor share one identity.
          The grid is masked at the top edge to fade into the LandingNav
          chrome and at the bottom to soften into the next section. */}
      <section
        aria-labelledby="hero-heading"
        className="relative overflow-hidden bg-blueprint-grid border-b border-[color:var(--color-paper-line)] dark:border-gray-800"
      >
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] mb-5">
              <span className="opacity-60">A-101</span>
              <span className="mx-2 opacity-40">·</span>
              Workplace planning, drafted
            </p>
            <h1
              id="hero-heading"
              className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.05] mb-5"
            >
              Draft your office.
              <br />
              Seat your team.
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-xl mx-auto lg:mx-0">
              An office planner that thinks like an architect and ships like a
              modern editor. Sketch walls and desks, drop your roster on the
              plan, share a living map with the people who need it.
            </p>
            {primaryCta}

            <LandingStats />
          </div>

          <div className="relative">
            {/* Faint cyan glow lifts the drawing off the gridded background */}
            <div
              aria-hidden="true"
              className="hero-glow-pulse absolute -inset-6 rounded-2xl bg-[color:var(--color-blueprint-soft)] blur-2xl"
            />
            <div className="relative rounded-xl border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] shadow-[0_1px_0_0_rgba(0,0,0,0.04),0_24px_48px_-24px_rgba(15,23,42,0.18)] overflow-hidden">
              {/* Sheet header — mimics a CAD title bar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-[color:var(--color-paper-line)] dark:border-gray-700 font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <span>Sheet · A-101 · North Wing</span>
                <span className="flex items-center gap-3">
                  <span>1 : 100</span>
                  <span className="opacity-50">·</span>
                  <span>FT/IN</span>
                </span>
              </div>
              <FloorPlanHero />
            </div>
          </div>
        </div>
      </section>

      {/* ───── Feature grid ─────
          Six tiles, 3 across at lg+. Hover reveals a subtle cyan top
          edge to telegraph that the cards are interactive without
          needing a button affordance. */}
      <section
        id="features"
        aria-labelledby="features-heading"
        className="max-w-6xl mx-auto px-6 py-20 lg:py-28 scroll-mt-16"
      >
        <div className="text-center mb-12">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] mb-3">
            §02 · Capabilities
          </p>
          <h2
            id="features-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight"
          >
            What's on the drafting table
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[color:var(--color-paper-line)] dark:bg-gray-800 border border-[color:var(--color-paper-line)] dark:border-gray-800 rounded-xl overflow-hidden">
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
            description="Presence cursors show who's viewing the plan right now, so planning meetings stay in the same pixel without a screen share."
          />
          <FeatureCard
            icon={Presentation}
            title="Present without switching tools"
            description="Full-screen presentation mode hides the editor chrome, so your floor plan fits straight into the next all-hands deck."
          />
        </div>
      </section>

      <HowItWorks />

      {/* ───── Closing CTA band ─────
          Replaces the previous indigo gradient. The dark blueprint
          band reads as the night-shift version of the hero — same
          identity, inverted. */}
      <section
        id="pricing"
        aria-labelledby="cta-heading"
        className="relative overflow-hidden bg-[color:var(--color-blueprint-strong)] dark:bg-[color:var(--color-paper-sunken)] scroll-mt-16"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '48px 48px, 48px 48px',
          }}
        />
        <div className="relative max-w-4xl mx-auto px-6 py-16 sm:py-20 text-center">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-cyan-200 mb-4">
            §03 · Free for teams up to 25
          </p>
          <h2
            id="cta-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3"
          >
            Open a fresh sheet.
          </h2>
          <p className="text-lg text-cyan-100 mb-8 max-w-xl mx-auto">
            No credit card. Upgrade when your team outgrows the free tier.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-[color:var(--color-blueprint-strong)] text-base font-medium rounded-lg hover:bg-cyan-50 transition-colors"
            >
              Create your first office
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/demo"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-white/30 text-white text-base font-medium rounded-lg hover:bg-white/10 transition-colors"
            >
              Open the demo plan
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}
