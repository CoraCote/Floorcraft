# Floorcraft — Notes for AI coding agents

This file is read by Claude Code, Codex, and other AI coding agents to
ground them on this project's conventions. It complements `README.md` —
read both before starting non-trivial work.

## Tech stack one-liner

React 19 + TypeScript + Vite + Tailwind v4 + Konva (floor-plan canvas)
+ react-flow (network topology graph) + Zustand stores + Supabase
(auth, persistence, edge functions) + jsPDF for PDF exports.

## Deploy workflow — IMPORTANT

**Do NOT run `netlify deploy --prod` after merging a PR.** The Netlify
GitHub integration auto-builds every push to `main` and ships it to
<https://floorcraft.space> in ~25-30 seconds. Running the CLI deploy
afterward duplicates work and clutters the deploy log.

The correct end-of-feature flow is:

1. `gh pr merge <N> --squash` (or merge via the UI)
2. Wait ~30 s for the auto-deploy to finish
3. Confirm with `npx netlify-cli api listSiteDeploys --data='{"site_id":"26cbe036-420c-42a1-9417-548c91dfd7e9","per_page":2}' | jq -r '.[] | "\(.context) \(.commit_ref[0:7]) \(.state)"'` — top row should be `production <merge-sha> ready`.

The CLI deploy command is only correct in one situation: shipping a
build that bypasses git entirely (a hotfix `dist/` produced locally
without an associated commit). That's exceptional, not routine.

## Test + build commands

- `npx tsc --noEmit` — type-check
- `npx vitest run --dir=src` — full test run scoped to `src/` (the
  `--dir=src` flag is important; without it vitest also picks up
  duplicate test copies inside `.claude/worktrees/`)
- `npm run build` — production bundle to `dist/`
- `npx eslint <files>` — lint specific files (the project doesn't run
  a full repo lint by default; check the files you touched)

## Code conventions

- **Stores:** Zustand. Each store lives in `src/stores/<name>Store.ts`
  and exposes a flat selector + action API. Avoid stuffing rendering
  state into the autosaved payload — there's a clean line between
  persistent (office payload) and ephemeral (UI / cursor / hover).
- **Tests:** Vitest + Testing Library. Test files live in
  `src/__tests__/` with the same name as the unit they cover. Pure
  modules get pure tests; React components get smoke tests where they
  matter.
- **Comments:** Substantive prose explaining *why* a non-obvious
  decision was made — sign conventions, edge cases, references to
  the milestone (M4, M6.5, etc.). Don't inline-comment what the code
  already says.
- **PR descriptions:** "## Summary" + "## Test plan" sections.
  Co-Authored-By: Claude Opus 4.7 trailer on commits.

## Branch & milestone naming

- Feature branches: `feat/<area>-<short-name>` (e.g. `feat/topology-templates`)
- Fix branches: `fix/<area>-<short-name>` (e.g. `fix/wall-bulge-aabb`)
- Milestones: `M<area>.<phase>` (e.g. M6.5 for the network-topology
  templates feature). Check the most recent commits with
  `git log --oneline -10` to spot the current milestone in flight.

## What lives where (selected)

```
src/
├── components/editor/
│   ├── Canvas/                     # Konva floor-plan canvas
│   ├── networkTopology/            # react-flow topology canvas + dialogs
│   └── NetworkTopologyPage.tsx     # /t/.../o/.../network surface
├── lib/
│   ├── networkTopology/            # pure topology helpers (templates, layout)
│   ├── integrations/meraki/        # Meraki types, fixtures, reconcile
│   ├── elementBounds.ts            # AABB for selection / fit-to-screen
│   └── wallPath.ts                 # arc + segment math for curved walls
├── stores/                         # Zustand stores
├── types/                          # shared shape definitions
└── __tests__/                      # vitest suites
```

## Things to NOT touch lightly

- `src/types/elements.ts` and `src/types/networkTopology.ts` — the
  persisted shapes. Adding a field requires a migration in
  `loadFromLegacyPayload.ts` so older payloads still load.
- `src/lib/wallPath.ts` — sign convention is documented at the top.
  Every consumer (renderer, attachment, polygon offset, AABB) shares
  the same convention; don't invert it locally.
- `netlify.toml` — `Referrer-Policy` and `frame-ancestors` headers
  are intentional. The `/share/*` override exists so embed mode works.
