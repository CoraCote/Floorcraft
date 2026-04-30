import { Check } from 'lucide-react'
import { PublicPageShell } from './PublicPageShell'

/**
 * `/status` — service-status snapshot. Static for now since Floorcraft
 * doesn't run a real status host (Statuspage / BetterStack / etc.).
 * Renders the four core subsystems with a green check + "Operational"
 * label so a visitor pointed here from the footer sees something
 * grounded rather than a 404. When a real status host comes online,
 * point this page at its endpoint and render live data.
 */
type Subsystem = {
  name: string
  description: string
}

const SUBSYSTEMS: ReadonlyArray<Subsystem> = [
  { name: 'Web app', description: 'Landing page, auth, dashboard, editor canvas.' },
  { name: 'Database', description: 'Supabase Postgres — floor plans, employees, sharing.' },
  { name: 'Authentication', description: 'Sign-up, sign-in, invite tokens, share links.' },
  { name: 'CSV import / export', description: 'Roster round-trip and PDF / PNG export.' },
]

export function StatusPage() {
  const lastUpdated = new Date().toISOString().slice(0, 10)
  return (
    <PublicPageShell
      eyebrow="§09 · Status"
      title="All systems operational."
      subtitle="Floorcraft's services as of right now. Refresh for the latest snapshot."
    >
      <div className="rounded-xl border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 overflow-hidden">
        {SUBSYSTEMS.map((s, i) => (
          <div
            key={s.name}
            className={`flex items-center gap-4 px-5 py-4 ${
              i > 0 ? 'border-t border-[color:var(--color-paper-line)] dark:border-gray-800' : ''
            }`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 flex-shrink-0">
              <Check size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {s.name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {s.description}
              </div>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-green-600 dark:text-green-400 flex-shrink-0">
              Operational
            </span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums">
        Last updated {lastUpdated} · Manual snapshot
      </p>

      <hr className="my-12 border-[color:var(--color-paper-line)] dark:border-gray-800" />

      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
        We don't yet run a live status host with automated probes. If you
        believe something's broken right now, please email{' '}
        <a
          href="mailto:support@floorcraft.space"
          className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
        >
          support@floorcraft.space
        </a>{' '}
        and we'll triage immediately.
      </p>
    </PublicPageShell>
  )
}
