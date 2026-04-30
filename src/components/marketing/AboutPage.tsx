import { Link } from 'react-router-dom'
import { PublicPageShell } from './PublicPageShell'

/**
 * `/about` — short story page. Three paragraphs answering the three
 * questions visitors actually have: what is this, who's it for, who's
 * behind it. Intentionally light on copy — the editor itself does the
 * persuading.
 */
export function AboutPage() {
  return (
    <PublicPageShell
      eyebrow="§01 · About"
      title="Office planning, the way an architect would draw it."
      subtitle="Floorcraft is built for IT operations teams, office managers, and workplace administrators who plan where people sit."
    >
      <div className="space-y-6 text-base leading-relaxed text-gray-700 dark:text-gray-300">
        <p>
          Most office-planning tools either feel like CAD software you need a
          training course to use, or like a CRM with a building-icon glued on.
          We wanted something in between — the precision of a real drafting
          tool with the iteration speed of a modern editor like Figma or
          Linear.
        </p>
        <p>
          Floorcraft started as an internal tool for a hybrid-work team that
          needed to plan office moves on a recurring cadence. It outgrew that
          original scope when other teams asked to use it. Today it powers
          floor plans for engineering teams, design studios, and operations
          groups across remote-first and hybrid-first organisations.
        </p>
        <p>
          The product is a small focused team's work-in-progress. We don't
          have a long enterprise sales cycle or a stack of sponsorship logos
          on the front page. What we do have is a tool that solves a specific
          problem cleanly. Open the{' '}
          <Link
            to="/demo"
            className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
          >
            sample office
          </Link>{' '}
          and see if it matches the way your team thinks about space.
        </p>
      </div>

      <hr className="my-12 border-[color:var(--color-paper-line)] dark:border-gray-800" />

      <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-3">
        How we build
      </h2>
      <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <li>· Small team. Fast iterations. Continuous deploys.</li>
        <li>· Vector-first chrome — every brand mark and illustration is SVG.</li>
        <li>· Prefer architectural cues over generic-SaaS aesthetics.</li>
        <li>· Public release notes live at{' '}
          <Link
            to="/changelog"
            className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
          >
            /changelog
          </Link>.
        </li>
      </ul>
    </PublicPageShell>
  )
}
