/**
 * Section metadata for the help page, extracted to a plain `.ts` file so
 * both the page layout and the cmd-K palette can import it without
 * tripping `react-refresh/only-export-components` (a `.tsx` module that
 * exports both a component and a plain data constant fails that rule).
 *
 * The IDs here MUST match the `id` props on each rendered `<section>` in
 * `HelpPage.tsx` — the palette uses them as scroll targets via
 * `document.getElementById(id).scrollIntoView(...)`.
 */
export interface HelpSectionMeta {
  id: string
  title: string
}

export const HELP_SECTIONS: HelpSectionMeta[] = [
  { id: 'whats-new', title: "What's new" },
  { id: 'getting-started', title: 'Getting started' },
  { id: 'teams-offices', title: 'Teams & offices' },
  { id: 'map-editor', title: 'Map (floor plan editor)' },
  { id: 'roster', title: 'Roster' },
  { id: 'seating', title: 'Seat assignment' },
  { id: 'reports', title: 'Reports' },
  { id: 'audit-log', title: 'Audit log' },
  { id: 'sharing', title: 'Sharing read-only links' },
  { id: 'shortcuts', title: 'Keyboard shortcuts' },
  { id: 'faq', title: 'FAQ' },
]
