import { Pencil, Users, Share2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * "How it works" — three-step explainer between the feature grid and
 * the trusted-by strip.
 *
 * The feature grid tells you *what* Floorcraft can do; this section
 * tells you how you'd actually use it on day one. Three steps is the
 * canonical marketing cadence (any more and the eye skips, any fewer
 * and it feels thin). The visual rhythm borrows from JSON Crack-style
 * explainer layouts — thin connector lines between numbered circles,
 * icons that match the step verb.
 *
 * The connector lines are an absolutely-positioned hairline under the
 * flex row on sm+ so the steps line up on a shared horizontal axis;
 * below sm the list collapses to a stacked column and the connectors
 * drop out entirely (they'd look arbitrary when vertical).
 */

type Step = {
  n: number
  icon: LucideIcon
  title: string
  description: string
}

const STEPS: ReadonlyArray<Step> = [
  {
    n: 1,
    icon: Pencil,
    title: 'Draw',
    description: 'Sketch walls, desks, and rooms on an infinite canvas with snap-to-grid alignment.',
  },
  {
    n: 2,
    icon: Users,
    title: 'Seat',
    description: 'Drop employees onto desks or import a CSV — neighborhood colors surface who sits where.',
  },
  {
    n: 3,
    icon: Share2,
    title: 'Share',
    description: 'Publish a read-only link or drop into presentation mode for the next all-hands.',
  },
]

export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="border-t border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-sunken)] dark:bg-gray-900/30"
    >
      <div className="max-w-5xl mx-auto px-6 py-20 lg:py-24">
        <div className="text-center mb-14">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] mb-3">
            §03 · Process
          </p>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight"
          >
            Blank sheet to published floor — in an hour.
          </h2>
        </div>

        <ol className="relative grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-0 sm:divide-x sm:divide-[color:var(--color-paper-line)] sm:dark:divide-gray-800">
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <li key={step.n} className="relative px-6 text-center sm:text-left">
                <div className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-3 tabular-nums">
                  Step {String(step.n).padStart(2, '0')}
                </div>
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]">
                    <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{step.title}</h3>
                </div>
                <p className="max-w-xs mx-auto sm:mx-0 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {step.description}
                </p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
