# Changelog

All notable changes to Floorcraft are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.2.0] — 2026-05-01 — Collaboration, comments, billing, admin

The first release after Drafting Studio. ~100 PRs of polish + new
capabilities, organised around four themes: collaboration with
external stakeholders (comment-mode share links), a real-time editor
sidebar (Recent Activity), a platform-admin surface for the
multi-tenant operator, and a Stripe billing scaffold so teams can
self-serve subscriptions.

### Added
- **Comment-mode share links** — anonymous viewers leave threaded
  comments on a shared office; owners reply and delete; "Revoked
  link" badges mark comments whose token has since been revoked;
  CSV export of every conversation. (#197 #198 #205 #206 #208 #209
  #210 #212 #213)
- **Recent Activity panel** in the editor's Insights tab, pulled from
  the team's audit feed. Real-time updates via Supabase channels;
  client-side search/filter; refresh chip; one-click CSV export.
  (#202 #207 #211 #214 #215)
- **Office archive** (#222) — soft-delete via the team-home kebab.
  Archived offices stay restorable; "Show archived" toggle on the
  dashboard surfaces them. Migration `0021_office_archive.sql` adds
  `archived_at`/`archived_by` columns and `archive_office` /
  `unarchive_office` SECURITY DEFINER RPCs.
- **Office duplicate** (#225) — clone a floor plan into a new office
  in one click. Payload only — share tokens, comments, and history
  start fresh, mirroring Linear/Notion duplicate semantics.
- **Roster cards-view parity** — keyboard navigation (Track C),
  per-row seat picker (Track A), bulk auto-assign to a neighborhood,
  per-column hide/show toggles. (#191 #194 #199 #200)
- **PDF / image underlay tooling** — insert via the file menu,
  calibrate scale by drawing a measured line, dedicated visibility
  category in the layers panel, drop-zone overlay on the canvas,
  multi-page PDF picker. (#192 #193 #195 #196 #203)
- **Platform-admin surface** (Phase 1 + 2 + Sprint 1A) — Overview
  dashboard with team / user / office counts, Teams browser, Users
  browser, Admins management, Audit log, and a per-team **Suspend**
  affordance backed by a database trigger that blocks writes while a
  member-facing banner explains it. (#217 #218 #220)
- **Stripe billing scaffold** — admin subscription console with
  at-risk-first sort, comp/override hatch for grants, Stripe-Dashboard
  deep-links; team-side `Settings → Billing` tab with current-plan
  card, status pill, Subscribe (Checkout) and Manage Billing
  (Customer Portal) buttons. Edge Functions for webhook + checkout +
  portal mints. (#221 #223)
- **Contextual `document.title`** across team, settings, account,
  admin, marketing, auth, invite, 404, and demo surfaces, plus a
  Mac-style "•" prefix on the editor tab when there are unsaved
  changes. (#224 #226 #228 #229 #232)
- **Per-team team-home preferences** (#230) — sort, filter, and
  "Show archived" toggle persist per team in localStorage.
- **Help: billing & subscription section** (#231) — dedicated guide
  for the new billing surface (subscribe, manage, statuses, comp).
- **Onboarding bootstrap script** for the first platform admin
  (#219) — one-paste SQL for getting a fresh project to the admin
  dashboard.

### Fixed
- Editor tool-rail: rich tooltips, the dotted-line continuation in
  the rail, and presentation rail behavior. (#201 #204)

### Internal
- New `useDocumentTitle` hook (`src/lib/useDocumentTitle.ts`)
  centralises the set-and-restore pattern that previously lived
  inline in `ProjectShell`.
- Migrations `0019_team_suspension.sql`, `0020_billing.sql`,
  `0021_office_archive.sql`.
- Edge Functions `stripe-webhook`, `stripe-checkout`, `stripe-portal`.

---

## [1.1.0] — 2026-04-30 — Drafting Studio redesign

A comprehensive identity refresh that pulls Floorcraft's visual language
out of generic 2021-era SaaS chrome (indigo gradients, blue-600 accents,
slate-50 backgrounds) and into a coherent **architect's drafting** look:
warm-paper backgrounds, blueprint-cyan accents, mono-numeric callouts,
and a two-tier graph-paper grid that runs through the marketing surface
*and* the editor canvas.

### Added
- **Drafting Studio design tokens** — `--color-paper`, `--color-paper-raised`,
  `--color-paper-sunken`, `--color-paper-line`, `--color-blueprint`,
  `--color-blueprint-strong`, `--color-blueprint-soft`, plus a
  `--font-mono` stack. All theme-aware with light + dark variants in
  `index.css`.
- **Public `/demo` route** — mounts the bundled seed office in read-only
  mode so visitors can poke at a real 3-floor populated plan without
  an account. Includes the full editor chrome: tool rail, layers panel,
  Plan/Roster/Insights right inspector, hover card, align toolbar,
  status bar, and minimap.
- **48-px primary nav rail** on the left edge of every editor view,
  replacing the 6-tab cluster previously crammed into the TopBar.
- **56-px tool rail** with grouped clusters (navigation · architecture
  · shapes · measurement) replacing the 260-px label-list tool picker.
- **3-tab right inspector** (Plan / Roster / Insights) replacing the
  previous 5-tab strip.
- **Compass-rose monogram** as the brand mark on every public surface.
- **Two-tier blueprint grid** on the editor canvas + shared
  `.bg-blueprint-grid` background utilities.
- **Modal entrance / dropdown / hero-glow animations**, all gated
  behind `prefers-reduced-motion: reduce`.
- **Mobile sign-in link** in the landing nav so phone visitors can act
  without scrolling past the hero.
- **Compass-rose favicon** + 1200×630 OG share image (both SVG).
- **theme-color meta tags** so mobile browser address bars tint to
  match the page chrome.
- Open Graph + Twitter card meta + proper page-level description.
- Soft scrollbar styling, translucent blueprint-cyan text-selection
  color, and `font-feature-settings` baked into mono surfaces.

### Changed
- **Landing page** rebuilt as a split hero (copy + technical drawing),
  warm-paper background with blueprint grid, mono section markers
  (A-101, §02, §03), and real footer destinations (the previous footer
  had 12 links pointing at `/help`).
- **FloorPlanHero** rebuilt as a real architectural drawing with
  dimension lines, north arrow, scale bar, title block, and a
  labelled desk callout.
- **Auth pages** migrate from indigo-gradient slate-50 to warm-paper
  blueprint grid.
- **HelpPage**, **TeamHomePage**, **ProjectShell**, **OfficeCard**, and
  every other major surface retoned to paper / blueprint tokens.
- **`Button`, `Input`, `Modal` primitives** migrated to paper +
  blueprint tokens.
- **Section eyebrows** across the app unified to a single mono
  cadence.
- **Demo seed walls** cleaned to 1500×1500 squares on every floor
  with doors and windows correctly anchored.
- **Konva-rendered surfaces** (Minimap, hover outline, desk-id disc)
  pin literal hex aliases of the blueprint tokens.
- 200+ inline `bg-blue-*` / `text-blue-*` / `border-blue-*` /
  `bg-gray-50` / `border-gray-200` / `bg-white` references migrated
  across 100+ files.

### Removed
- Legacy `BrowserFrame.tsx` and the indigo-gradient diamond logo.
- Placeholder Trusted-by-ACME/NIMBUS/ORBIT logo strip from the landing.
- Footer columns of dead `/help` links (Pricing / Status / About /
  Privacy / Terms / Changelog) — collapsed to two columns of real
  destinations.

### Tests
- 1899 / 264 pass; assertions for `Button`, `Input`, `RightSidebar`,
  `StatusBar`, `ElementLibrary`, and `ProjectShell` updated to match
  the new tokens and copy. No behavioural regressions.

[1.1.0]: https://github.com/rcasto123/Floorcraft/releases/tag/v1.1.0

## [1.0.0] — 2026-04-21

### Added
- Multi-floor canvas editor with 20+ element types (rooms, desks, walls, curved wall segments, shapes)
- Employee seating assignment with atomic mutation and conflict detection
- Team workspaces with RLS-backed sharing and role-based access control
- Six-analyzer insights engine: utilization, proximity, onboarding readiness, moves, equipment, and trends
- Export to PNG, PDF, JSON, and CSV
- 50-step undo/redo powered by Zundo
- Supabase-backed authentication and cloud sync with optimistic locking
- CSV round-trip import/export for employee rosters
- Presentation mode with minimap navigation
- Alignment guides and keyboard shortcuts
- Floor plan templates
- Code-split lazy loading for dashboard, insights, and landing pages
- GitHub Actions CI (build, lint, test on every push and PR)
- Dependabot for automated weekly dependency updates

[1.0.0]: https://github.com/rcasto123/Floorcraft/releases/tag/v1.0.0
