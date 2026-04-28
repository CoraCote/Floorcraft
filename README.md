# Floorcraft

> Interactive office floor planner and seating management application for modern teams

[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20DB-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Live demo:** https://floorcraft.space

---

## Overview

Floorcraft is a browser-based office floor planner built for IT operations teams, office managers, and workplace administrators. Users draw floor plans with walls, doors, and windows on a Konva canvas, populate the space with desks, conference rooms, phone booths, and decorative elements, then assign employees to seats — all persisted in real time to a team-scoped Supabase backend. An AI-style insights engine continuously analyzes seat utilization, team proximity, onboarding readiness, pending moves, and equipment status, surfacing actionable warnings directly in the editor sidebar.

---

## Features

- **Multi-floor canvas editor** — draw walls (including curved/arc segments), doors with configurable swing direction, and windows on a snapping grid; switch between floors using a tab bar with drag-to-reorder; zoom in/out with scroll wheel or keyboard shortcuts; pan with middle-mouse or the pan tool
- **Rich element library** — 20+ element types: desks (standard, L-shape, cubicle), hot desks, workstations, private offices (U-shape), conference rooms, phone booths, common areas, chairs, counters, tables (rectangular, conference, round, oval), dividers, planters, text labels, background images, and a full decorative set (armchair, couch, reception desk, kitchen counter, fridge, whiteboard, column, stairs, elevator)
- **Curved wall segments** — per-segment arc bulges rendered as smooth SVG-style arcs on the Konva stage; editing handles let you drag any midpoint to bend a straight segment into a curve
- **Smart wall attachment** — doors and windows snap to the nearest wall and track its position when the wall is moved; a ghost preview shows the snap target before drop
- **Seat assignment** — drag employees from the People panel onto desks, workstations, or private offices; duplicate elements automatically clear occupant fields; assignment mutations atomically update both the element and the employee record
- **Employee management** — full CRUD for employees with name, email, department, team, title, manager (org-chart hierarchy), employment type (full-time/part-time/contractor), status, office days, start/end dates, equipment needs, photo URL, and free-form tags
- **CSV round-trip** — export the full employee roster to CSV (manager exported by name for portability), edit in any spreadsheet app, and re-import with a two-pass resolver that matches manager names back to IDs
- **Insights engine** — six pluggable analyzers run on every canvas + roster change: **utilization** (over/under-occupied zones), **team proximity** (scattered team members), **onboarding** (new-hire seat readiness), **moves** (pending relocation flags), **equipment** (unresolved equipment needs), and **trends** (occupancy patterns); insights are severity-ranked (critical / warning / info), filterable by category, and persistable as dismissed per-project in `localStorage`
- **Reports panel** — four report overlays: Seat Map Color Mode (color seats by department, team, employment type, or office days), Org Chart Overlay (visualize manager–report chains on the canvas), Move Planner (track in-progress employee relocations), and Employee Directory (searchable/filterable full-roster table)
- **Export** — export the active floor as PNG (configurable pixel ratio), PDF (A4/A3/Letter, portrait or landscape, 150 or 300 DPI), or JSON (full project payload for backup/migration)
- **Undo/redo with temporal Zustand** — up to 50-step undo history via `zundo`; assignment fields are deliberately excluded from the undo tree to prevent element ↔ employee state desync
- **Team workspaces** — each account belongs to one or more named teams (identified by a URL slug); team admins can rename/delete the team, invite members by email (via a Resend-powered Edge Function), and remove members
- **Per-office sharing and permissions** — offices can be public (all team members get editor access by default) or private (owner-only unless an explicit per-user role is set); a ShareModal exposes a visibility toggle and a per-member role table (owner / editor / viewer) backed by Supabase RLS
- **Conflict-safe cloud sync** — changes are debounced 2 seconds then saved with an optimistic-lock (`updated_at` predicate); if another session wrote first, a ConflictModal lets the user choose Reload (discard local) or Overwrite (force-save); transient errors retry with exponential backoff up to 30 s
- **Auth flows** — email/password sign-up, login, forgot-password, and email-link verify/reset; invite tokens in email links pre-fill the sign-up form and auto-accept team membership on first sign-in
- **Code-split lazy loading** — the Konva canvas tree and all editor chunks are loaded on demand; the landing page ships the minimum JS bundle
- **Floor plan templates** — four built-in starter templates: Blank Canvas, Open Plan Office (~40 desks), Mixed Office (6 private offices + 30 open desks), and Executive Floor (12 private offices + boardroom)
- **Keyboard shortcuts** — full keyboard shortcut set with a discoverable overlay (`?` key); shortcuts are suppressed when a modal or drawer owns focus via a modal reference count in `uiStore`
- **Alignment guides** — live magenta guide lines appear when dragging elements near the horizontal/vertical edges of other elements (configurable threshold)
- **Minimap** — always-on minimap shows viewport position relative to the full canvas extent
- **Presentation mode** — hides all sidebars and toolbars for clean screen-sharing or screenshot capture

---

## Tech Stack

| Package | Version | Purpose |
|---|---|---|
| `react` | 19.2 | UI framework |
| `react-dom` | 19.2 | DOM renderer |
| `react-router-dom` | 7.14 | Client-side routing |
| `konva` | 10.2 | 2D canvas rendering engine |
| `react-konva` | 19.2 | React bindings for Konva |
| `zustand` | 5.0 | Client state management |
| `zundo` | 2.3 | Temporal (undo/redo) middleware for Zustand |
| `@supabase/supabase-js` | 2.104 | Supabase client (auth + database) |
| `tailwindcss` | 4.2 | Utility-first CSS (Vite plugin, no config file) |
| `@radix-ui/react-dialog` | 1.1 | Accessible modal dialogs |
| `@radix-ui/react-dropdown-menu` | 2.1 | Dropdown menus |
| `@radix-ui/react-context-menu` | 2.2 | Right-click context menus |
| `@radix-ui/react-popover` | 1.1 | Popovers |
| `@radix-ui/react-tabs` | 1.1 | Tab navigation |
| `@radix-ui/react-tooltip` | 1.2 | Tooltips |
| `@tanstack/react-virtual` | 3.13 | Virtualized lists for large rosters |
| `jspdf` | 4.2 | PDF export |
| `papaparse` | 5.5 | CSV parsing and generation |
| `nanoid` | 5.1 | Unique ID generation |
| `lucide-react` | 1.8 | Icon library |
| `vite` | 8.0 | Build tool and dev server |
| `typescript` | 6.0 | Type safety |
| `vitest` | 4.1 | Unit and component testing |
| `@testing-library/react` | 16.3 | React component testing utilities |
| `eslint` | 9.39 | Linting |
| `supabase` (CLI) | 1.226 | Database migrations and Edge Functions |

---

## Architecture

### Canvas Layer (Konva / react-konva)

The editor canvas is a `react-konva` `<Stage>` managed by `CanvasStage.tsx`. Each element type maps to a dedicated renderer component:

- `WallRenderer` — polyline walls with optional per-segment arc bulges
- `DoorRenderer` / `WindowRenderer` — wall-attached elements with snap ghosts
- `DeskRenderer`, `FurnitureRenderer`, `RoomRenderer`, `TableRenderer` — seating and space elements
- `ElementRenderer` — dispatcher that routes each `CanvasElement` to the correct renderer
- `SelectionOverlay` — multi-select bounding box with resize handles
- `AlignmentGuides` — live snapping guide lines during drag
- `GridLayer` — background dot/line grid
- `WallDrawingOverlay` / `WallEditOverlay` — overlays that capture pointer events during wall draw/edit sessions

Custom shapes (L-desk, cubicle, U-office, round/oval tables, all decor pieces) live in `src/components/editor/Canvas/shapes/` and are rendered as Konva `Shape` nodes with programmatic path functions.

### State Management (Zustand)

Seven Zustand stores provide the full client state:

| Store | File | Manages |
|---|---|---|
| `useCanvasStore` | `stores/canvasStore.ts` | Viewport position, zoom scale, active tool, grid settings |
| `useElementsStore` | `stores/elementsStore.ts` | All canvas elements keyed by ID; wrapped in `zundo` for undo/redo (50-step limit) |
| `useFloorStore` | `stores/floorStore.ts` | Floor list, active floor, per-floor element snapshots |
| `useProjectStore` | `stores/projectStore.ts` | Project metadata, save state, Supabase office ID, optimistic-lock version, conflict payload |
| `useEmployeeStore` | `stores/employeeStore.ts` | Employee roster, department color palette, search/filter/sort UI state |
| `useInsightsStore` | `stores/insightsStore.ts` | Insight results, dismissal set (persisted in `localStorage` per project), filter state |
| `useCollaborationStore` | `stores/collaborationStore.ts` | Cursor positions and comments (foundation for real-time multi-user, not yet wired to Supabase Realtime) |

`useElementsStore` uses `zundo`'s `temporal` middleware. Assignment fields (`assignedEmployeeId`, `assignedEmployeeIds`, seat `assignedGuestId`) are stripped from the undo snapshot via `partialize` so undoing a spatial move cannot desync element and employee state.

### Data Persistence (Supabase)

Supabase provides the full backend:

- **Database** — 5 migration files define the schema (`offices`, `profiles`, `team_members`, `invites`, `office_permissions`), RLS helper functions, row-level security policies, triggers (e.g. auto-create profile on signup), and an `accept_invite` RPC
- **Auth** — Supabase Auth with email/password; the `AuthProvider` wraps the app and exposes a `useSession()` hook; `RequireAuth` and `RequireTeam` route guards redirect unauthenticated users
- **Edge Functions** — `send-invite-email` sends team invitation emails via the [Resend](https://resend.com) API
- **Optimistic locking** — `saveOffice()` issues `UPDATE offices SET payload=... WHERE id=? AND updated_at=?`; a `null` result means another session wrote first, triggering the ConflictModal
- **Repositories** — `officeRepository.ts` (CRUD for offices), `permissionsRepository.ts` (per-user role overrides), `teamRepository.ts` (team + member operations)

### Routing (React Router v7)

```
/                          LandingPage (public)
/login                     LoginPage
/signup                    SignupPage
/forgot                    ForgotPasswordPage
/auth/verify               AuthVerifyPage (email link callback)
/auth/reset                AuthResetPage (password reset callback)
/invite/:token             InvitePage (accept team invite)
/onboarding/team           TeamOnboardingPage (RequireAuth)
/account                   AccountPage (RequireAuth)
/dashboard                 DashboardRedirect → /t/:teamSlug (RequireAuth + RequireTeam)
/t/:teamSlug               TeamHomePage — office grid
/t/:teamSlug/settings      TeamSettingsPage
  (index)                    → TeamSettingsGeneral
  members                    → TeamSettingsMembers
/t/:teamSlug/o/:officeSlug ProjectShell (editor layout route)
  (index → map)              MapView — Konva canvas
  roster                     RosterPage — employee management
```

The editor tree (`ProjectShell`, `MapView`, `RosterPage`) is code-split with `React.lazy` to keep the landing page bundle lean.

---

## Getting Started

### Prerequisites

- **Node.js 20** (specified in `netlify.toml`; `node -v` should be `>=20`)
- A **Supabase** project (free tier works fine for development)
- A **Resend** account (only needed if you want to test team invite emails)

### Installation

```bash
git clone https://github.com/rcasto123/Floorcraft.git
cd Floorcraft
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL (e.g. `https://xyz.supabase.co`). Found in Supabase dashboard → Project Settings → API. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase `anon` / public key. Same location as above. Injected into the browser bundle — safe to expose. |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only | Service role key for server-side operations. Never expose in the browser. |
| `RESEND_API_KEY` | Edge Functions only | API key from [resend.com](https://resend.com) dashboard. Powers team invite emails. |
| `APP_URL` | Edge Functions only | Base URL of the deployed app (e.g. `https://floorcraft.space`). Used to construct invite callback URLs. |

> `VITE_*` variables are bundled into the client at build time. The other three are only read inside Supabase Edge Functions and should be set as Supabase secrets, not in `.env.local`.

### Apply Database Migrations

```bash
npx supabase db push
# or for local development:
npx supabase start
npx supabase db reset
```

### Development

```bash
npm run dev
```

Starts the Vite dev server at `http://localhost:5173` with HMR.

### Building

```bash
npm run build
```

Runs `tsc -b` (project-references type check) followed by `vite build`. Output is written to `dist/`.

### Preview Production Build

```bash
npm run preview
```

### Running Tests

```bash
npm test          # run once
npm run test:watch  # watch mode
```

---

## Project Structure

```
src/
├── App.tsx                  # Root component — router + AuthProvider + lazy route tree
├── main.tsx                 # Vite entry point
├── index.css                # Tailwind v4 base styles
├── vite-env.d.ts            # Vite env type declarations
│
├── components/
│   ├── auth/                # Login, signup, forgot-password, verify/reset, route guards
│   ├── dashboard/           # NewProjectModal (legacy, pre-team)
│   ├── editor/
│   │   ├── Canvas/          # Konva stage + all element renderers + shape library
│   │   ├── LeftSidebar/     # Tool selector + element library drag-to-drop
│   │   ├── RightSidebar/    # Properties, People, Reports, Insights panels
│   │   ├── Share/           # Visibility radio + access table sub-components
│   │   └── *.tsx            # Editor-level: ProjectShell, TopBar, StatusBar, MapView,
│   │                        #   RosterPage, ShareModal, ExportDialog, FloorSwitcher,
│   │                        #   ConflictModal, Minimap, KeyboardShortcutsOverlay
│   ├── landing/             # LandingPage with session-aware CTAs
│   ├── reports/             # EmployeeDirectory, MovePlanner, OccupancyDashboard,
│   │                        #   OrgChartOverlay, SeatMapColorMode, UnassignedReport
│   └── team/                # TeamHomePage, TeamOnboarding, TeamSettings (General +
│                            #   Members), TeamSwitcher, UserMenu, AccountPage, InvitePage
│
├── stores/                  # Zustand stores (see Architecture section)
│
├── hooks/
│   ├── useActiveFloorElements.ts  # Derived selector: elements on the active floor
│   ├── useKeyboardShortcuts.ts    # Global keyboard shortcut registration
│   ├── useTemporalState.ts        # Exposes zundo undo/redo from elementsStore
│   └── useWallDrawing.ts          # State machine for the interactive wall drawing tool
│
├── lib/
│   ├── analyzers/           # Six insight analyzer modules + composite runner
│   ├── auth/                # AuthProvider, session utilities
│   ├── offices/             # officeRepository, permissionsRepository, useOfficeSync
│   ├── teams/               # teamRepository, useMyTeams hook
│   ├── constants.ts         # Grid size, zoom limits, element defaults, color palettes
│   ├── csv.ts               # Generic CSV parse helpers
│   ├── employeeCsv.ts       # Employee-specific CSV export/import
│   ├── exportJson.ts        # Full project JSON export
│   ├── exportPdf.ts         # jsPDF-based PDF export
│   ├── exportPng.ts         # Konva stage PNG export
│   ├── geometry.ts          # Point/vector math utilities
│   ├── seatAssignment.ts    # Atomic element ↔ employee seat assignment mutations
│   ├── seatLayout.ts        # Auto-compute seat positions for tables
│   ├── slug.ts              # URL slug generation
│   ├── supabase.ts          # Singleton Supabase client
│   ├── time.ts              # Date formatting utilities
│   ├── wallAttachment.ts    # Door/window snap-to-wall geometry
│   ├── wallEditing.ts       # Wall node drag/move operations
│   └── wallPath.ts          # Arc bulge math (curved wall geometry)
│
├── data/
│   └── templates/           # Built-in floor plan templates (blank, open-plan, mixed, executive)
│
├── types/                   # TypeScript interfaces — elements, employee, floor, project,
│                            #   team, auth, insights, collaboration
│
└── __tests__/               # Vitest unit and component tests (~35 test files)
    └── analyzers/           # Per-analyzer unit tests
```

---

## Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Start Vite dev server with HMR |
| `build` | `tsc -b && vite build` | Type-check then bundle for production |
| `preview` | `vite preview` | Serve the `dist/` folder locally |
| `lint` | `eslint .` | Run ESLint across all source files |
| `test` | `vitest run` | Run the full test suite once |
| `test:watch` | `vitest` | Run tests in interactive watch mode |

---

## Deployment

Floorcraft deploys to **Netlify** at <https://floorcraft.space>. The `netlify.toml` sets the build command to `npm run build`, publishes `dist/`, and adds a catch-all redirect to `index.html` for client-side routing. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify → Project settings → Environment variables.

### How a deploy happens

The Netlify GitHub integration is wired to the `rcasto123/Floorcraft` repository with `main` as the production branch:

| Trigger | What happens | Time | Context |
|---|---|---|---|
| Push (or merge) to `main` | Netlify auto-builds from the commit and ships to production | ~25–30 s | `production` |
| Open / push to a non-main branch with an open PR | Netlify builds a deploy preview; URL lands as a PR check | ~25–30 s | `deploy-preview` |

**You do not need to run `netlify deploy --prod` after merging a PR.** The merge commit triggers the auto-build, and the production URL updates automatically when it finishes. The CLI manual-deploy command is only useful for one-off pushes that bypass git (e.g. testing a hotfix dist/ before opening a PR), and it should be considered an exception, not part of the normal flow.

To confirm the auto-deploy after a merge, watch the latest production deploy:

```bash
npx netlify-cli api listSiteDeploys \
  --data='{"site_id":"<site-id>","per_page":3}' \
  | jq -r '.[] | "\(.created_at) | \(.context) | \(.commit_ref[0:7]) | \(.state)"'
```

A row with `production`, your merge commit's SHA, and `state: "ready"` means the deploy is live.

### Edge Functions

Edge Functions are deployed to Supabase:

```bash
npx supabase functions deploy send-invite-email
npx supabase secrets set RESEND_API_KEY=<your-key> APP_URL=https://floorcraft.space
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and add tests where appropriate
4. Ensure the test suite and linter pass: `npm test && npm run lint`
5. Open a pull request against `main` with a clear description of what changed and why

---

## License

[MIT](LICENSE) — © Floorcraft contributors
