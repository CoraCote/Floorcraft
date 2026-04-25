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
      className="max-w-5xl mx-auto px-6 pb-20 sm:pb-24"
    >
      <div className="text-center mb-12">
        <h2
          id="how-it-works-heading"
          className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          How it works
        </h2>
        <p className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          From blank canvas to published floor in an hour.
        </p>
      </div>

      <ol className="relative grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8">
        {/* Hairline connector line behind the three circles, sm+ only.
            We position it with a fraction of the grid so it starts
            mid-circle on the left step and ends mid-circle on the
            right step, not edge-to-edge. */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute top-6 left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-gray-800"
        />

        {STEPS.map((step) => {
          const Icon = step.icon
          return (
            <li key={step.n} className="relative text-center">
              <div className="relative z-10 mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-blue-600 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-blue-400">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 tabular-nums">
                Step {step.n}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{step.title}</h3>
              <p className="mt-2 max-w-xs mx-auto text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {step.description}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
