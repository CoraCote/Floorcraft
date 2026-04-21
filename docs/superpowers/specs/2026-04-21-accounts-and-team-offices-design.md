# Accounts & Team Offices — Design Spec

**Date:** 2026-04-21
**Status:** Approved for implementation planning
**Supersedes:** client-only localStorage model

## Goal

Turn Floorcraft from a single-user browser tool (localStorage-only) into a multi-user SaaS where teams of office-ops people share and edit office-plan documents. Ship the foundation: accounts, cloud-persisted offices, team membership, and per-office access control. Explicitly **defer** live multi-user co-editing to a later spec.

## Scope (v1)

In:
- Email + password auth (Supabase).
- Cloud-persisted offices (Supabase Postgres).
- Teams: a user belongs to ≥1 team; offices belong to one team.
- Per-office ACL: Owner / Editor / Viewer with a "default editor" rule for team members.
- Email-based team invites with a signup deep-link.
- Route-level auth gating with Supabase Row-Level Security as the source of truth.

Out (v2+):
- OAuth / SSO (Google, SAML).
- Live co-editing (cursors, CRDT, presence).
- Invite links (shareable URL tokens not tied to a specific email).
- Domain auto-join.
- Audit log of office changes.
- Per-team billing.

## Non-goals / explicit cuts

- **No backend API layer.** Browser talks to Supabase directly; authz is RLS.
- **No dual-mode (local + cloud).** Clean cutover — existing localStorage offices are abandoned. Users re-create or re-import via CSV.
- **No cross-team sharing.** To grant access to a non-team-member, you first invite them to the team.

## Architecture

**Stack delta:**
- Add `@supabase/supabase-js` client + a single Supabase Edge Function (`send-invite-email`) that uses Resend for transactional email.
- Remove localStorage persistence paths (`floocraft-autosave` key, `loadAutoSave`, `saveAutoSave`).
- Keep Zustand stores; change what hydrates them (Supabase fetch instead of localStorage read) and what `useAutoSave` writes to.

**Runtime data flow:**
```
  Browser (React + Zustand)
       │
       ├── supabase.auth.*        → JWT session
       ├── supabase.from('...')   → reads/writes via RLS
       └── supabase.functions.invoke('send-invite-email')
                                    ↓
                              (Edge Function → Resend → recipient inbox)
```

**Authorization boundary:** every table has RLS enabled. The client can call any query it wants — Postgres returns only rows the caller is entitled to see/modify. No client-side authz check disagrees with a server-side one because the server is the only check.

## Data model

Six tables. All use `uuid` primary keys unless noted.

### `profiles` (mirrors `auth.users`)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| email | text | copied from auth for display; source-of-truth is auth.users |
| name | text | user-editable |
| avatar_url | text | optional |
| active_team_id | uuid FK → teams(id) nullable | survives reloads, controls team switcher default |
| created_at | timestamptz |  |

Auto-created by trigger on `auth.users` insert.

### `teams`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | URL segment (generated from name) |
| name | text | display |
| created_by | uuid FK → profiles(id) | |
| created_at | timestamptz | |

### `team_members`

| Column | Type | Notes |
|---|---|---|
| team_id | uuid FK | |
| user_id | uuid FK | |
| role | text | `'admin'` \| `'member'` |
| joined_at | timestamptz | |

PK = `(team_id, user_id)`. Trigger on `teams` insert auto-adds creator as `admin`.

### `invites`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| team_id | uuid FK | |
| email | text | |
| token | uuid | random, used in /invite/:token URL |
| invited_by | uuid FK → profiles(id) | |
| created_at | timestamptz | |
| expires_at | timestamptz | default now() + 7 days |
| accepted_at | timestamptz nullable | |

Unique partial index on `(team_id, email) WHERE accepted_at IS NULL` — one active invite per (team, email) at a time.

### `offices`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| team_id | uuid FK | required |
| slug | text | unique per team |
| name | text | |
| created_by | uuid FK → profiles(id) | |
| is_private | boolean | default `false` |
| payload | jsonb | entire floor-plan blob — floors, elements, employees, departmentColors, canvas settings |
| created_at | timestamptz | |
| updated_at | timestamptz | bumped by trigger on update; drives optimistic concurrency |

Unique `(team_id, slug)`.

**`payload` schema:** identical to today's `loadAutoSave` payload. Includes a top-level `version` integer; the existing migration switch-statement (handles missing `employee.status`, missing `wall.bulge`, etc.) is preserved verbatim in the new load path. Adding elements does not require a table migration.

### `office_permissions`

| Column | Type | Notes |
|---|---|---|
| office_id | uuid FK | |
| user_id | uuid FK | |
| role | text | `'owner'` \| `'editor'` \| `'viewer'` |
| created_at | timestamptz | |

PK = `(office_id, user_id)`. Only stores the owner row + explicit overrides. "Default editor for team members" is derived in RLS.

## RLS policies

All tables have RLS enabled. Policies expressed in terms of `auth.uid()` (current signed-in user).

**Helper functions (SQL):**
```sql
create function is_team_member(tid uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from team_members where team_id = tid and user_id = auth.uid()
  )
$$;

create function is_team_admin(tid uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from team_members
    where team_id = tid and user_id = auth.uid() and role = 'admin'
  )
$$;

create function has_office_perm(oid uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from office_permissions where office_id = oid and user_id = auth.uid()
  )
$$;

create function office_perm_role(oid uuid) returns text language sql stable as $$
  select role from office_permissions
   where office_id = oid and user_id = auth.uid()
$$;
```

### Policies per table

**profiles**
- SELECT: `id = auth.uid()` OR the user shares a team with the profile owner.
- UPDATE: `id = auth.uid()`.
- INSERT/DELETE: not allowed from client (trigger handles insert on signup).

**teams**
- SELECT: `is_team_member(id)`.
- INSERT: any authenticated user (you create a team → trigger auto-adds you as admin).
- UPDATE: `is_team_admin(id)`.
- DELETE: `is_team_admin(id)`.

**team_members**
- SELECT: `is_team_member(team_id)`.
- INSERT: `is_team_admin(team_id)` OR (self-row inserted by accept-invite flow — enforced via Edge Function or SECURITY DEFINER RPC; direct client insert denied).
- UPDATE: `is_team_admin(team_id)`.
- DELETE: `is_team_admin(team_id)` OR `user_id = auth.uid()` (leave-self).

**invites**
- SELECT: `is_team_admin(team_id)` OR `email = auth.email()`.
- INSERT: `is_team_admin(team_id)`.
- UPDATE: recipient (setting `accepted_at`) — enforced via RPC, direct client update denied.
- DELETE: `is_team_admin(team_id)`.

**offices**
- SELECT: `is_team_member(team_id) AND (NOT is_private OR has_office_perm(id))`.
- INSERT: `is_team_member(team_id)` (trigger writes the creator's owner row in `office_permissions`).
- UPDATE:
  - `office_perm_role(id) IN ('owner','editor')` — explicit permission wins
  - OR `is_team_member(team_id) AND NOT is_private AND office_perm_role(id) IS DISTINCT FROM 'viewer'` — default-editor path
- DELETE: `office_perm_role(id) = 'owner'` OR `is_team_admin(team_id)`.

**office_permissions**
- SELECT: `is_team_member( (select team_id from offices where id = office_id) )`.
- INSERT/UPDATE/DELETE: `office_perm_role(office_id) = 'owner'` OR `is_team_admin( (select team_id from offices where id = office_id) )`.

### Triggers

- `on auth.users insert → insert into profiles(id, email) values (new.id, new.email)`
- `on teams insert → insert into team_members(team_id, user_id, role) values (new.id, new.created_by, 'admin')`
- `on offices insert → insert into office_permissions(office_id, user_id, role) values (new.id, new.created_by, 'owner')`
- `on offices update → set new.updated_at = now()`

## Auth + invite flows

### Signup (no invite)

1. `/signup` form: email, password, name.
2. `supabase.auth.signUp({ email, password })` → Supabase sends verify email.
3. Verify link → `/auth/verify?token=...` → session established → profile row exists (via trigger).
4. Redirect to `/onboarding/team`: "Create a team" form.
5. INSERT `teams` → trigger adds current user as admin → redirect to `/t/:slug`.

### Signup (with invite)

1. `/signup?invite=<token>`: same form, pre-fills email from invite.
2. After email verify, the accept-invite flow runs automatically:
   - RPC `accept_invite(token)` (SECURITY DEFINER) validates token, inserts `team_members` row, sets `invites.accepted_at = now()`.
3. Redirect to `/t/:slug` (the team from the invite).

### Login

1. `/login`: email + password → `supabase.auth.signInWithPassword()`.
2. If `profiles.active_team_id` set AND user still a member → redirect to `/dashboard` which redirects to `/t/<that-team>`.
3. Else pick first team in `team_members` for this user, set as active, redirect.
4. Zero teams → `/onboarding/team`.

### Invite a teammate

1. `/t/:slug/settings` → Members tab → "Invite" → email input.
2. INSERT `invites { team_id, email, token=uuid, expires_at=now()+7d }`.
3. `supabase.functions.invoke('send-invite-email', { token, team_name, inviter_name })`.
4. Edge Function → Resend → recipient inbox.
5. Recipient clicks link → `/invite/:token` → if signed in with matching email, "Join {Team}" button → RPC `accept_invite(token)` → redirect to `/t/:slug`. Otherwise, redirect to `/signup?invite=<token>` (pre-fills email).

### Forgot password

Stock Supabase flow: `/login` "Forgot password" → Supabase sends reset email → `/auth/reset` page → new password → signed in.

### Logout

`supabase.auth.signOut()` → clear Zustand stores → redirect to `/login`.

### Edge Function: `send-invite-email`

Minimal (40-line) Deno function in `supabase/functions/send-invite-email/`:
- Validates caller is a team admin for `team_id` (via `SELECT`-in-function with service role).
- Fetches invite row by `token`.
- Renders a simple HTML email ("You've been invited to **{team_name}** on Floorcraft by {inviter_name}. [Accept invite]").
- Calls Resend REST API.
- Returns `{ ok: true }` or an error.

Environment variables: `RESEND_API_KEY`, `APP_URL` (for the invite link).

### RPC: `accept_invite(token uuid)`

SECURITY DEFINER function in Supabase. Looks up invite by token, checks `expires_at > now()` and `accepted_at IS NULL` and `email = auth.email()`, then atomically:
1. INSERT into `team_members(team_id, user_id, role='member')`.
2. UPDATE `invites` SET `accepted_at = now()`.
3. Returns `team_id` (so the client can navigate).

Defined server-side because the client can't INSERT into `team_members` directly (RLS denies self-insert), and doing the insert in an RPC keeps the authz check co-located with the mutation.

## Sync model

### Load

```
/t/:teamSlug/o/:officeSlug
  ↓
  offices.select('id, team_id, payload, updated_at, is_private')
    .eq('team_id', activeTeamId)
    .eq('slug', officeSlug)
    .single()
  → RLS returns empty → 404 page (no existence leak)
  → hydrate Zustand stores from payload (existing migration switch)
  → stash loadedVersion = row.updated_at in projectStore
```

Loading UI: skeleton screen (not the existing "empty canvas flicker") while the query runs. Typical round-trip ~150ms on Supabase free tier.

### Save (debounced 2s — same cadence as today)

```sql
UPDATE offices
   SET payload = $payload
 WHERE id = $id
   AND updated_at = $loadedVersion
RETURNING updated_at
```

- Row returned → success, `loadedVersion = returned.updated_at`, indicator → "Saved".
- Zero rows returned → **conflict**: someone else saved between my load and my save.

### Conflict UI

Red indicator → modal:

> **This office was edited by someone else since you opened it.**
> - **Reload** — discard my local changes, load their version.
> - **Overwrite** — save my version anyway, discarding theirs.
> - **Cancel** — keep editing locally; you can try again.

"Overwrite" does a second UPDATE without the version guard. Crude but predictable; matches the "not live co-editing" scope.

### Offline / transient errors

- SDK throws on network failure → indicator → "Save failed, retrying…".
- Backoff: 2s, 5s, 15s, 30s. After ~60s of no success, indicator pins to red with a "Retry" button.
- `beforeunload` handler fires when there's unsaved state in the retry queue.
- Retry queue holds only the latest payload — newer saves supersede older ones.

### What is not done in v1

- No realtime subscription to office changes. If a teammate saves while you're looking, you don't know until you reload. (Realtime is a single `channel()` subscription for v2 — design leaves room.)
- No cursor presence.
- No CRDT / operational transform.

## UI + routes

### Route map

```
PUBLIC
/                                         landing — sign up / log in CTAs
/login                                    email + password
/signup                                   accepts ?invite=<token>
/auth/verify                              Supabase email-verify callback
/auth/reset                               password reset landing
/invite/:token                            accept-invite gate

AUTH-REQUIRED
/onboarding/team                          first-team creation
/dashboard                                redirects to /t/<active_team>
/t/:teamSlug                              team home — office grid
/t/:teamSlug/settings                     General + Members tabs (admin)
/t/:teamSlug/o/:officeSlug                redirects to /map
/t/:teamSlug/o/:officeSlug/map            existing MapView
/t/:teamSlug/o/:officeSlug/roster         existing RosterPage
/account                                  personal settings (name, password)
```

URL scheme change: today's `/project/:slug/map` becomes `/t/:teamSlug/o/:officeSlug/map`. Team-prefixed URLs make invite links unambiguous and prevent slug collisions across teams.

### Route guards

```tsx
<RequireAuth>       // redirect to /login?next=... if no session
  <RequireTeam>     // redirect to /onboarding/team if no team_member rows
    <Outlet />
  </RequireTeam>
</RequireAuth>
```

Per-office access is not a client check — RLS returns empty and the UI shows a 404.

### TopBar additions

- **Team switcher** (top-left, left of project name): dropdown listing user's teams + "Create new team." Writes `profiles.active_team_id` on switch.
- **User menu** (top-right): avatar + email, "Account", "Log out".
- Everything else — Map/Roster pill, Undo/Redo, zoom, save indicator, presentation toggle, Share, Export — unchanged.

### Share modal

Replaces today's placeholder. Three sections:

**Visibility**
- Team can edit (default)
- Team can view (read-only for team; individual overrides still apply)
- Private (only people with explicit access)

Writes `offices.is_private`. "Team can view" is encoded as `is_private = false` plus every team member getting an explicit `viewer` row (a trigger or client fan-out — deferred decision; implementation plan will choose).

**Access**
- Table: (user, role dropdown, remove button). Role = Owner / Editor / Viewer. Owner row not removable by non-owner; at least one owner always exists.
- "Add team member…" autocomplete, scoped to `team_members` of this office's team.
- To grant access to a non-team-member: explicit "They need to join the team first — invite them from Team Settings."

**Link**
- Canonical URL (`https://floorcraft.space/t/.../o/...`) + Copy button. Works for any teammate via RLS.

### New page: team home (`/t/:teamSlug`)

- Card grid of the team's offices, sorted by `updated_at DESC`. Search box.
- "New office" button → INSERT `offices` with default payload → navigate to `/t/:slug/o/:newSlug/map`.
- Empty state: "No offices yet — [Create your first]".

### Landing page (`/`) change

- Existing hero/marketing stays.
- If signed-in → primary CTA becomes "Continue to {Team Name}" → `/dashboard`.
- If not → "Sign up" primary, "Log in" secondary.

## Testing strategy

### Unit / component

- Auth pages: form validation, error surfacing, redirect targets (`/login`, `/signup`, `/auth/verify`, `/auth/reset`, `/invite/:token`, `/onboarding/team`).
- Route guards: `RequireAuth` and `RequireTeam` redirect correctly given mocked session states.
- TopBar: team switcher updates `profiles.active_team_id`; user menu signs out.
- Share modal: visibility radio writes `is_private`; adding a viewer writes to `office_permissions`.
- Office home grid: renders team's offices, sort/search, new-office button.
- Conflict modal: "reload" / "overwrite" / "cancel" all behave as specified.

### Integration (Supabase test instance)

- Full signup → verify → create team → create office → save → reload.
- Invite flow: admin invites email → Edge Function called (mocked Resend) → recipient signup via `?invite=` → `accept_invite` RPC → team_member row exists.
- RLS smoke: non-member cannot SELECT another team's offices; viewer cannot UPDATE; default-editor path works when `is_private=false`; explicit viewer override wins over default.
- Conflict: two sessions open same office, both edit, later save triggers conflict modal.

### Manual

- End-to-end invite flow with a real inbox.
- Offline save retry: DevTools "Offline" → edit → observe retry backoff → back online → save succeeds.
- Session expiry mid-edit: drop JWT → next save gets 401 → redirect to `/login?next=...`.

## Rollout

The existing deploy pipeline (auto-deploy on `main`) handles this. Rollout is gated by one env change: adding `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Netlify. Without those, the app boots into an "unconfigured" error screen — safer than booting into a broken unauthenticated state.

Because we're doing a clean break with localStorage, on first deploy users see a login screen. The existing user set is small (testing only), so no migration announcement needed. If this changes (real users start adopting before the cutover), add a short-term "export your work" banner to the current `main` two weeks before the cutover — deferred until we know it's needed.

## Open questions (tracked, not blocking)

- "Team can view" encoding — explicit viewer rows vs. a `default_role` column on `offices`. Resolved at implementation time; either works.
- Rate limiting on invite sends — Supabase has row insert rate limits per-user, probably enough. Revisit if abuse surfaces.
- Resend vs. SendGrid vs. Supabase native email — default Resend for MVP cost + DX. Swap is ~10 lines.

## v2 pointers

The design leaves room for these without schema changes:
- Realtime: a `channel('office:<id>')` subscription on the office page fires on `UPDATE`; implementation can choose "heads-up reload" (simple) or full CRDT (complex).
- OAuth: Supabase `signInWithOAuth()` — new button on `/login`, no data-model change.
- Invite links: new column on `invites` (`any_email bool`) + a single-use-link variant of `accept_invite` RPC.
- Domain auto-join: new `team_domains(team_id, domain)` table; signup-hook checks for matching domain.
- Audit log: new `office_events(office_id, user_id, action, payload, created_at)` table with append-only RLS.

## Success criteria

- Two users from different browsers can sign up, create/join the same team, and edit the same office (sequentially, not concurrently).
- RLS prevents a signed-in user from reading another team's offices even via direct SDK call from the browser console.
- Save conflict is surfaced with a user-facing resolution, not silent data loss.
- Signup → first save round-trip completes in under 10 seconds on a cold cache.
- Invite email arrives in recipient's inbox within 30 seconds of the admin clicking "Invite".
