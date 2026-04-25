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
  { id: 'team-home', title: 'Team home dashboard' },
  { id: 'map-editor', title: 'Map (floor plan editor)' },
  { id: 'annotations', title: 'Annotations' },
  { id: 'presentation', title: 'Presentation mode' },
  { id: 'roster', title: 'Roster' },
  { id: 'seating', title: 'Seat assignment' },
  { id: 'reports', title: 'Reports' },
  { id: 'csv-import', title: 'CSV import preview' },
  { id: 'command-palette', title: 'Command palette' },
  { id: 'notifications', title: 'Notifications & toasts' },
  { id: 'account', title: 'Account, menus & save state' },
  { id: 'audit-log', title: 'Audit log' },
  { id: 'sharing', title: 'Sharing & read-only view' },
  { id: 'shortcuts', title: 'Keyboard shortcuts' },
  { id: 'a11y-darkmode', title: 'Dark mode & accessibility' },
  { id: 'faq', title: 'FAQ' },
]
