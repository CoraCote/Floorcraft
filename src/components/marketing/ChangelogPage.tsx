import { PublicPageShell } from './PublicPageShell'

/**
 * `/changelog` — public release notes. Authored by hand here (rather
 * than parsing CHANGELOG.md at build time) so the marketing surface can
 * present each release as a structured, scannable list with the
 * Drafting Studio identity. The CHANGELOG.md in repo root remains the
 * canonical engineering record; this page mirrors the same content
 * for visitors.
 */
type Release = {
  version: string
  date: string
  title: string
  bullets: string[]
}

const RELEASES: ReadonlyArray<Release> = [
  {
    version: '1.2.0',
    date: '2026-05-01',
    title: 'Collaboration, comments, billing',
    bullets: [
      'Comment-mode share links — anonymous viewers can leave threaded comments; owners reply, delete, and see "Revoked link" badges; CSV export of every conversation.',
      'Realtime everywhere — comments and Recent Activity now stream via Supabase channels; the Insights panel shows refresh chips and unread-count badges.',
      'Recent Activity panel in the editor sidebar with client-side search/filter and one-click CSV export.',
      'Roster cards view: keyboard navigation (Track C), seat picker (Track A), bulk auto-assign to a neighborhood, hide/show columns.',
      'Office archive — soft-delete via the dashboard kebab; archived offices stay restorable until an admin hard-deletes them.',
      'Office duplicate — clone a floor plan into a new office in one click (payload only; share tokens, comments, and history start fresh).',
      'PDF/image underlay tools: insert via the file menu, calibrate scale, dedicated visibility category, drop-zone overlay on the canvas.',
      'Platform admin surface — overview dashboard, teams + users browsers, suspend-team write-block with member banner, audit log.',
      'Stripe billing scaffold — admin subscription console + team-side Subscribe / Manage Billing buttons; comp / override hatch for grants.',
      'Contextual document.title across team, settings, account, admin, and marketing pages.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-04-30',
    title: 'Drafting Studio redesign',
    bullets: [
      'Warm-paper backgrounds + blueprint-cyan accents replace the indigo-gradient SaaS chrome.',
      'Public /demo route mounts a populated 3-floor sample office in read-only mode.',
      'Editor TopBar slimmed; project views moved to a 48-px primary nav rail on the left.',
      '56-px icon-only tool rail with grouped clusters (navigation · architecture · shapes · measurement).',
      'Right inspector reorganised into Plan / Roster / Insights tabs with collapsible sections.',
      'Compass-rose monogram replaces the legacy diamond logo on every public surface.',
      'Mono-numeric stat cards across dashboard and reports.',
      'Compass-rose favicon, OG share image, and theme-color meta tags.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-04-21',
    title: 'Floorcraft 1.0 — initial release',
    bullets: [
      'Multi-floor canvas editor with 20+ element types (rooms, desks, walls, curved walls, shapes).',
      'Employee seating assignment with atomic mutation and conflict detection.',
      'Team workspaces with RLS-backed sharing and role-based access control.',
      'Six-analyzer insights engine (utilization, proximity, onboarding, moves, equipment, trends).',
      'Export to PNG, PDF, JSON, and CSV.',
      '50-step undo/redo via Zundo; Supabase-backed cloud sync with optimistic locking.',
      'Presentation mode, alignment guides, keyboard shortcuts, floor plan templates.',
    ],
  },
]

export function ChangelogPage() {
  return (
    <PublicPageShell
      eyebrow="§05 · Release notes"
      documentTitle="Changelog — Floorcraft"
      title="What's new in Floorcraft."
      subtitle="Every release lands here, newest first. Major waves get their own version; smaller polish ships continuously."
    >
      <div className="space-y-12">
        {RELEASES.map((r) => (
          <article key={r.version} className="border-l-2 border-[color:var(--color-blueprint)]/40 pl-6">
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <span className="font-mono text-base font-medium text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]">
                v{r.version}
              </span>
              <span className="font-mono text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                {r.date}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {r.title}
            </h2>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {r.bullets.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className="text-[color:var(--color-blueprint)]">·</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <p className="mt-16 text-xs text-gray-500 dark:text-gray-400 font-mono">
        Older releases live in the engineering changelog at{' '}
        <a
          href="https://github.com/rcasto123/Floorcraft/blob/main/CHANGELOG.md"
          className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] hover:underline"
        >
          github.com/rcasto123/Floorcraft/blob/main/CHANGELOG.md
        </a>
        .
      </p>
    </PublicPageShell>
  )
}
