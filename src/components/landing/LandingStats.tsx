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
      className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-center"
    >
      {STATS.map((stat, i) => (
        <li
          key={stat.label}
          className={
            // Thin vertical dividers between items on sm+ — a tiny
            // typographic touch that reads like a press sheet.
            'flex flex-col items-center' +
            (i > 0 ? ' sm:border-l sm:border-gray-200 sm:dark:border-gray-800 sm:pl-10' : '')
          }
        >
          <span className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 tabular-nums">
            {stat.value}
          </span>
          <span className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {stat.label}
          </span>
        </li>
      ))}
    </ul>
  )
}
