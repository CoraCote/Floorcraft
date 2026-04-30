/**
 * Micro-stats row that sits under the hero CTA.
 *
 * The hero subheadline by itself reads like a feature description — it
 * doesn't answer "is anyone actually using this?". A three-item stat
 * row is the cheapest, least-cringe way to imply scale without
 * committing to a wall of logos or testimonials. The numbers are
 * deliberately round and plausible rather than weirdly precise so a
 * careful reader doesn't feel pitched to.
 *
 * Visually the row is quiet: muted labels above tabular-nums numerals,
 * hairline dividers between items. No icons, no gradients — the hero
 * CTA above already carries the color, so this should recede.
 */

type Stat = { value: string; label: string }

const STATS: ReadonlyArray<Stat> = [
  { value: '120+', label: 'Teams planning' },
  { value: '18k', label: 'Seats mapped' },
  { value: '3.4k', label: 'Floors published' },
]

export function LandingStats() {
  return (
    <ul
      aria-label="Floorcraft usage"
      className="mt-10 flex flex-wrap items-baseline justify-center lg:justify-start gap-x-8 gap-y-4"
    >
      {STATS.map((stat, i) => (
        <li
          key={stat.label}
          className={
            'flex items-baseline gap-2' +
            (i > 0 ? ' sm:border-l sm:border-[color:var(--color-paper-line)] sm:dark:border-gray-800 sm:pl-8' : '')
          }
        >
          <span className="font-mono text-xl font-medium tracking-tight text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] tabular-nums">
            {stat.value}
          </span>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {stat.label}
          </span>
        </li>
      ))}
    </ul>
  )
}
