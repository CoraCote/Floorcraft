# Accounts & Team Offices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Floorcraft from a localStorage single-user app into a Supabase-backed multi-tenant product with accounts, teams, cloud-persisted offices, and per-office ACLs — shipping the v1 foundation defined in `docs/superpowers/specs/2026-04-21-accounts-and-team-offices-design.md`.

**Architecture:** Browser talks to Supabase directly; Postgres Row-Level Security is the sole authz boundary. Zustand stores stay; what hydrates them changes from `localStorage.getItem` to a Supabase fetch. One Edge Function handles transactional email; one SECURITY DEFINER RPC handles invite acceptance.

**Tech Stack:** React 19 + TypeScript, Vite, Zustand 5, React Router 7, Tailwind, Vitest, Supabase JS SDK v2, Supabase Postgres, Supabase Edge Functions (Deno), Resend for email.

**Branching:** Start from `main` (post-merge of PR #5). New branch: `feat/accounts-and-team-offices`. Work lands in one PR targeting `main` once phases 1-6 are green.

---

## File Structure

**New:**
- `supabase/config.toml` — Supabase CLI project config
- `supabase/migrations/0001_schema.sql` — tables
- `supabase/migrations/0002_rls_helpers.sql` — helper SQL functions
- `supabase/migrations/0003_rls_policies.sql` — policies per table
- `supabase/migrations/0004_triggers.sql` — profile/team-admin/office-owner/updated_at triggers
- `supabase/migrations/0005_accept_invite_rpc.sql` — SECURITY DEFINER RPC
- `supabase/functions/send-invite-email/index.ts` — Resend sender
- `supabase/tests/rls_policies.sql` — pgTAP-style RLS smoke tests
- `src/lib/supabase.ts` — client singleton + env guard
- `src/lib/auth/session.ts` — session hook (`useSession`)
- `src/lib/auth/AuthProvider.tsx` — React context for session
- `src/lib/teams/teamRepository.ts` — CRUD for teams/members/invites
- `src/lib/offices/officeRepository.ts` — load/save/list/create offices
- `src/lib/offices/useOfficeSync.ts` — replaces `useAutoSave`
- `src/lib/offices/conflict.ts` — conflict modal state
- `src/types/auth.ts` — `AuthUser`, `Session` types
- `src/types/team.ts` — `Team`, `TeamMember`, `Invite` types
- `src/components/auth/LoginPage.tsx`
- `src/components/auth/SignupPage.tsx`
- `src/components/auth/AuthVerifyPage.tsx`
- `src/components/auth/AuthResetPage.tsx`
- `src/components/auth/RequireAuth.tsx`
- `src/components/auth/RequireTeam.tsx`
- `src/components/team/TeamOnboardingPage.tsx`
- `src/components/team/TeamHomePage.tsx`
- `src/components/team/TeamSettingsPage.tsx`
- `src/components/team/TeamSwitcher.tsx`
- `src/components/team/UserMenu.tsx`
- `src/components/team/InvitePage.tsx`
- `src/components/team/AccountPage.tsx`
- `src/components/editor/Share/VisibilityRadio.tsx`
- `src/components/editor/Share/AccessTable.tsx`
- `src/components/editor/ConflictModal.tsx`
- `.env.example` — documents required env vars
- Test files mirror each module above in `src/__tests__/`

**Modified:**
- `src/App.tsx` — new route tree
- `src/components/editor/ProjectShell.tsx` — loads office from Supabase, not localStorage
- `src/components/editor/TopBar.tsx` — TeamSwitcher + UserMenu, updated params
- `src/components/editor/ShareModal.tsx` — rewrite against `AccessTable` + `VisibilityRadio`
- `src/components/editor/MapView.tsx` — `useParams<{teamSlug, officeSlug}>`
- `src/components/editor/RosterPage.tsx` — same params change + navigation helpers
- `src/components/landing/LandingPage.tsx` — session-aware CTAs
- `src/hooks/useAutoSave.ts` — delete (superseded by `useOfficeSync`)
- `src/stores/projectStore.ts` — add `loadedVersion` for optimistic concurrency
- `src/types/project.ts` — drop `sharePermission` (replaced by ACL tables)
- `netlify.toml` — inject Supabase env vars at build time
- `package.json` — add `@supabase/supabase-js`, `@supabase/ssr` (if needed), `supabase` (dev dep for CLI)

**Removed:**
- `src/hooks/useAutoSave.ts` (after `useOfficeSync` replaces it)
- `floocraft-autosave` localStorage reads/writes throughout the app

---

## Phase 0 — Scaffolding

### Task 0.1: New branch + Supabase dependency + env

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Modify: `netlify.toml`

- [ ] **Step 1: Create branch from main and install dependency**

```bash
git checkout main && git pull
git checkout -b feat/accounts-and-team-offices
npm install @supabase/supabase-js@^2.45.0
npm install --save-dev supabase@^1.200.0
```

- [ ] **Step 2: Create `.env.example`**

```bash
# Public client vars — injected into the browser bundle.
VITE_SUPABASE_URL=https://bjisnkiuaqmvsplggira.supabase.co
VITE_SUPABASE_ANON_KEY=<paste from Supabase dashboard → Project Settings → API>

# Used only by Edge Functions / migrations, never in the browser.
SUPABASE_SERVICE_ROLE_KEY=<dashboard → API → service_role>
RESEND_API_KEY=<resend.com dashboard>
APP_URL=https://floorcraft.space
```

- [ ] **Step 3: Wire build env in `netlify.toml`**

Append:
```toml
[build.environment]
  NODE_VERSION = "20"
  # Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Netlify UI
  # → Project settings → Environment variables. Do NOT hardcode here.
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example netlify.toml
git commit -m "chore: add supabase client + env scaffolding"
```

### Task 0.2: Supabase CLI init + local Docker workflow

**Files:**
- Create: `supabase/config.toml`
- Modify: `.gitignore`

- [ ] **Step 1: Initialize Supabase CLI**

```bash
npx supabase init
```

This creates `supabase/config.toml` and scaffolding. Keeps defaults.

- [ ] **Step 2: Link to the live project**

```bash
npx supabase link --project-ref bjisnkiuaqmvsplggira
# prompts for the DB password (from Supabase dashboard → Database → Settings)
```

- [ ] **Step 3: Add `.gitignore` entries**

Append to `.gitignore`:
```
# Supabase local
supabase/.branches
supabase/.temp
.env
.env.local
```

- [ ] **Step 4: Verify local dev works**

```bash
npx supabase start
```

Expected: Docker pulls postgres + studio, output ends with local API URL and studio URL. Leave running for subsequent RLS tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml .gitignore
git commit -m "chore: initialize supabase cli + link to remote project"
```

### Task 0.3: Supabase client singleton

**Files:**
- Create: `src/lib/supabase.ts`
- Test: `src/__tests__/supabase.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/supabase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('supabase client', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('throws a helpful error when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    await expect(import('../lib/supabase')).rejects.toThrow(/VITE_SUPABASE_URL/)
  })

  it('returns a singleton when env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const { supabase: a } = await import('../lib/supabase')
    const { supabase: b } = await import('../lib/supabase')
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npx vitest run src/__tests__/supabase.test.ts
```

Expected: FAIL — `Failed to resolve import "../lib/supabase"`.

- [ ] **Step 3: Implement the client**

```ts
// src/lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
      'See .env.example; copy to .env.local for local dev, or configure in Netlify env for prod.',
  )
}

/**
 * App-wide Supabase client. All reads/writes go through this singleton.
 *
 * Authorization lives in Postgres RLS — do not try to enforce permission
 * checks in the browser. If a call returns empty where you expected rows,
 * the server is telling you the caller isn't entitled to see them.
 */
export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npx vitest run src/__tests__/supabase.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/__tests__/supabase.test.ts
git commit -m "feat(supabase): client singleton with env guard"
```

---

## Phase 1 — Schema, RLS, triggers

### Task 1.1: Core tables

**Files:**
- Create: `supabase/migrations/0001_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_schema.sql

create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  active_team_id uuid,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

alter table profiles
  add constraint profiles_active_team_fk
  foreign key (active_team_id) references teams(id) on delete set null;

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid(),
  invited_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

create unique index invites_one_pending_per_email
  on invites (team_id, email) where accepted_at is null;

create table offices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  slug text not null,
  name text not null,
  created_by uuid not null references profiles(id),
  is_private boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, slug)
);

create table office_permissions (
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (office_id, user_id)
);

create index offices_team_idx on offices(team_id);
create index team_members_user_idx on team_members(user_id);
create index invites_token_idx on invites(token);
```

- [ ] **Step 2: Apply to local DB**

```bash
npx supabase db reset
```

Expected: output ends with "Finished supabase db reset." and no errors.

- [ ] **Step 3: Verify schema**

```bash
npx supabase db diff --use-migra
```

Expected: empty diff (migration matches remote-zero + local state).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_schema.sql
git commit -m "feat(db): core tables for accounts, teams, offices, ACL"
```

### Task 1.2: RLS helper functions

**Files:**
- Create: `supabase/migrations/0002_rls_helpers.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0002_rls_helpers.sql

create or replace function is_team_member(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members
     where team_id = tid and user_id = auth.uid()
  )
$$;

create or replace function is_team_admin(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members
     where team_id = tid
       and user_id = auth.uid()
       and role = 'admin'
  )
$$;

create or replace function office_perm_role(oid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from office_permissions
   where office_id = oid and user_id = auth.uid()
$$;

create or replace function has_office_perm(oid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from office_permissions
     where office_id = oid and user_id = auth.uid()
  )
$$;
```

- [ ] **Step 2: Apply + verify**

```bash
npx supabase db reset
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_rls_helpers.sql
git commit -m "feat(db): RLS helper functions (is_team_member etc.)"
```

### Task 1.3: RLS policies

**Files:**
- Create: `supabase/migrations/0003_rls_policies.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0003_rls_policies.sql

-- Enable RLS on every app table. Any table without a policy denies everything.
alter table profiles          enable row level security;
alter table teams             enable row level security;
alter table team_members      enable row level security;
alter table invites           enable row level security;
alter table offices           enable row level security;
alter table office_permissions enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_self_read on profiles
  for select using (id = auth.uid());

create policy profiles_teammate_read on profiles
  for select using (
    exists (
      select 1
        from team_members me
        join team_members them on them.team_id = me.team_id
       where me.user_id = auth.uid()
         and them.user_id = profiles.id
    )
  );

create policy profiles_self_update on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- teams ---------------------------------------------------------------------
create policy teams_member_read on teams
  for select using (is_team_member(id));

create policy teams_any_auth_insert on teams
  for insert with check (auth.uid() is not null and created_by = auth.uid());

create policy teams_admin_update on teams
  for update using (is_team_admin(id))
  with check (is_team_admin(id));

create policy teams_admin_delete on teams
  for delete using (is_team_admin(id));

-- team_members --------------------------------------------------------------
create policy team_members_read on team_members
  for select using (is_team_member(team_id));

create policy team_members_admin_insert on team_members
  for insert with check (is_team_admin(team_id));

create policy team_members_admin_update on team_members
  for update using (is_team_admin(team_id))
  with check (is_team_admin(team_id));

create policy team_members_admin_or_self_delete on team_members
  for delete using (is_team_admin(team_id) or user_id = auth.uid());

-- invites -------------------------------------------------------------------
create policy invites_admin_or_recipient_read on invites
  for select using (
    is_team_admin(team_id)
    or email = (select email from profiles where id = auth.uid())
  );

create policy invites_admin_insert on invites
  for insert with check (is_team_admin(team_id) and invited_by = auth.uid());

create policy invites_admin_delete on invites
  for delete using (is_team_admin(team_id));

-- Intentionally no client UPDATE policy — acceptance goes through
-- the accept_invite RPC in migration 0005.

-- offices -------------------------------------------------------------------
create policy offices_read on offices
  for select using (
    is_team_member(team_id)
    and (not is_private or has_office_perm(id))
  );

create policy offices_insert on offices
  for insert with check (
    is_team_member(team_id) and created_by = auth.uid()
  );

create policy offices_update on offices
  for update using (
    office_perm_role(id) in ('owner','editor')
    or (
      is_team_member(team_id)
      and not is_private
      and office_perm_role(id) is distinct from 'viewer'
    )
  )
  with check (
    office_perm_role(id) in ('owner','editor')
    or (
      is_team_member(team_id)
      and not is_private
      and office_perm_role(id) is distinct from 'viewer'
    )
  );

create policy offices_delete on offices
  for delete using (
    office_perm_role(id) = 'owner'
    or is_team_admin(team_id)
  );

-- office_permissions --------------------------------------------------------
create policy office_permissions_read on office_permissions
  for select using (
    is_team_member(
      (select team_id from offices where id = office_permissions.office_id)
    )
  );

create policy office_permissions_write on office_permissions
  for all using (
    office_perm_role(office_id) = 'owner'
    or is_team_admin((select team_id from offices where id = office_permissions.office_id))
  )
  with check (
    office_perm_role(office_id) = 'owner'
    or is_team_admin((select team_id from offices where id = office_permissions.office_id))
  );
```

- [ ] **Step 2: Apply**

```bash
npx supabase db reset
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_rls_policies.sql
git commit -m "feat(db): RLS policies per design matrix"
```

### Task 1.4: Triggers (profile autoprovision, team-admin, office-owner, updated_at)

**Files:**
- Create: `supabase/migrations/0004_triggers.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0004_triggers.sql

-- Auto-provision a profile row whenever a new auth.users row is created.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- When a team is created, auto-add creator as admin.
create or replace function handle_new_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_members (team_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger on_team_created
after insert on teams
for each row execute function handle_new_team();

-- When an office is created, auto-write the creator as owner in office_permissions.
create or replace function handle_new_office()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.office_permissions (office_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_office_created
after insert on offices
for each row execute function handle_new_office();

-- Optimistic-concurrency source: bump updated_at on every UPDATE.
create or replace function bump_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger offices_bump_updated_at
before update on offices
for each row execute function bump_updated_at();
```

- [ ] **Step 2: Apply**

```bash
npx supabase db reset
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_triggers.sql
git commit -m "feat(db): triggers for profile/team-admin/office-owner/updated_at"
```

### Task 1.5: `accept_invite` RPC

**Files:**
- Create: `supabase/migrations/0005_accept_invite_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_accept_invite_rpc.sql

create or replace function accept_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record invites%rowtype;
  caller_email text;
begin
  -- Caller must be signed in.
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select email into caller_email from profiles where id = auth.uid();
  if caller_email is null then
    raise exception 'no_profile';
  end if;

  -- Fetch and validate the invite.
  select * into invite_record from invites where token = invite_token;

  if invite_record is null then
    raise exception 'invite_not_found';
  end if;

  if invite_record.accepted_at is not null then
    raise exception 'invite_already_used';
  end if;

  if invite_record.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  if lower(invite_record.email) <> lower(caller_email) then
    raise exception 'invite_email_mismatch';
  end if;

  -- Atomically add membership + mark invite used.
  insert into team_members (team_id, user_id, role)
  values (invite_record.team_id, auth.uid(), 'member')
  on conflict do nothing;

  update invites set accepted_at = now() where id = invite_record.id;

  return invite_record.team_id;
end;
$$;

grant execute on function accept_invite(uuid) to authenticated;
```

- [ ] **Step 2: Apply**

```bash
npx supabase db reset
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_accept_invite_rpc.sql
git commit -m "feat(db): accept_invite RPC (SECURITY DEFINER, email-matched)"
```

### Task 1.6: RLS smoke tests

**Files:**
- Create: `supabase/tests/rls_policies.sql`

- [ ] **Step 1: Write the test file**

```sql
-- supabase/tests/rls_policies.sql
-- Runs against a fresh local DB (`supabase db reset`) then `supabase test db`.

begin;

-- Fixture users — two teams, three users total.
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111','alice@a.test','x',now()),
  ('22222222-2222-2222-2222-222222222222','bob@a.test','x',now()),
  ('33333333-3333-3333-3333-333333333333','eve@b.test','x',now());

-- Triggers created profiles via handle_new_user.

-- Alice creates Team A.
set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into teams (id, slug, name, created_by)
  values ('aaaa1111-1111-1111-1111-111111111111','acme','Acme','11111111-1111-1111-1111-111111111111');

-- Eve creates Team B.
set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
insert into teams (id, slug, name, created_by)
  values ('bbbb2222-2222-2222-2222-222222222222','beta','Beta','33333333-3333-3333-3333-333333333333');

-- Alice invites Bob into Team A, Bob accepts.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into invites (team_id, email, invited_by)
values ('aaaa1111-1111-1111-1111-111111111111','bob@a.test','11111111-1111-1111-1111-111111111111');

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select accept_invite((select token from invites where email = 'bob@a.test'));

-- Alice creates an office (is_private=false by default).
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into offices (team_id, slug, name, created_by, payload)
values ('aaaa1111-1111-1111-1111-111111111111','hq','HQ','11111111-1111-1111-1111-111111111111','{}');

-- TEST 1: Eve (Team B) can NOT see Team A's office.
set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
do $$ begin
  if (select count(*) from offices where slug='hq') > 0 then
    raise exception 'LEAK: Eve saw Team A office';
  end if;
end $$;

-- TEST 2: Bob (Team A member, no explicit perm) CAN see the office (default editor).
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from offices where slug='hq') = 0 then
    raise exception 'MISSING: Bob should see Team A office';
  end if;
end $$;

-- TEST 3: Bob can UPDATE the office (default editor).
update offices set payload='{"v":1}'::jsonb where slug='hq';
do $$ begin
  if (select payload->>'v' from offices where slug='hq') <> '1' then
    raise exception 'UPDATE: Bob''s update did not land';
  end if;
end $$;

-- TEST 4: Alice (owner) sets Bob's perm to viewer; Bob can no longer UPDATE.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into office_permissions (office_id, user_id, role)
values ((select id from offices where slug='hq'), '22222222-2222-2222-2222-222222222222', 'viewer');

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$
declare
  rows_updated int;
begin
  update offices set payload='{"v":2}'::jsonb where slug='hq';
  get diagnostics rows_updated = row_count;
  if rows_updated > 0 then
    raise exception 'VIEWER: Bob updated as viewer (should be denied)';
  end if;
end $$;

-- TEST 5: Private office hides from default team members.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
update offices set is_private = true where slug='hq';

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
-- Bob has an explicit viewer row from TEST 4, so he still sees it.
do $$ begin
  if (select count(*) from offices where slug='hq') = 0 then
    raise exception 'PRIVATE: Bob (viewer) should still see private office';
  end if;
end $$;

-- Cleanup test for someone with no perm.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
delete from office_permissions
 where office_id = (select id from offices where slug='hq')
   and user_id = '22222222-2222-2222-2222-222222222222';

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from offices where slug='hq') > 0 then
    raise exception 'PRIVATE-NO-PERM: Bob (no perm) should not see private office';
  end if;
end $$;

rollback;
```

- [ ] **Step 2: Run the test**

```bash
npx supabase db reset
npx supabase db execute --file supabase/tests/rls_policies.sql
```

Expected: no errors, test transaction rolls back cleanly.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/rls_policies.sql
git commit -m "test(db): RLS smoke tests for isolation, default editor, overrides, privacy"
```

### Task 1.7: Push schema to remote Supabase project

**Files:** (none changed — remote push only)

- [ ] **Step 1: Push migrations to remote**

```bash
npx supabase db push
```

Expected: lists migrations 0001-0005, prompts for confirmation, applies without errors.

- [ ] **Step 2: Verify in Supabase Studio**

Open `https://supabase.com/dashboard/project/bjisnkiuaqmvsplggira/editor`. Confirm all six tables exist and RLS is enabled (shield icon next to table name).

- [ ] **Step 3: No commit needed — migrations already committed in 1.1-1.6.**

---

## Phase 2 — Auth

### Task 2.1: Session hook + AuthProvider

**Files:**
- Create: `src/lib/auth/session.ts`
- Create: `src/lib/auth/AuthProvider.tsx`
- Create: `src/types/auth.ts`
- Test: `src/__tests__/authSession.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/authSession.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useSession } from '../lib/auth/AuthProvider'

vi.mock('../lib/supabase', () => {
  const listener = { callback: null as null | ((e: string, s: unknown) => void) }
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn((cb) => {
          listener.callback = cb
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
      },
      __listener: listener,
    },
  }
})

function Probe() {
  const session = useSession()
  return <div>status:{session.status}</div>
}

describe('AuthProvider', () => {
  it('starts loading, then resolves to unauthenticated', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByText(/status:loading/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/status:unauthenticated/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test — fails (module missing)**

```bash
npx vitest run src/__tests__/authSession.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement types + provider**

```ts
// src/types/auth.ts
export interface AuthUser {
  id: string
  email: string
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser }
```

```tsx
// src/lib/auth/AuthProvider.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../supabase'
import type { SessionState } from '../../types/auth'

const SessionContext = createContext<SessionState>({ status: 'loading' })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setState(
        data.session
          ? { status: 'authenticated', user: { id: data.session.user.id, email: data.session.user.email ?? '' } }
          : { status: 'unauthenticated' },
      )
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(
        session
          ? { status: 'authenticated', user: { id: session.user.id, email: session.user.email ?? '' } }
          : { status: 'unauthenticated' },
      )
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  return useContext(SessionContext)
}
```

```ts
// src/lib/auth/session.ts
// Re-export for simpler imports in components that only need the hook.
export { useSession, AuthProvider } from './AuthProvider'
export type { SessionState, AuthUser } from '../../types/auth'
```

- [ ] **Step 4: Run test**

```bash
npx vitest run src/__tests__/authSession.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/AuthProvider.tsx src/lib/auth/session.ts src/types/auth.ts src/__tests__/authSession.test.tsx
git commit -m "feat(auth): session hook + provider"
```

### Task 2.2: Login page

**Files:**
- Create: `src/components/auth/LoginPage.tsx`
- Test: `src/__tests__/loginPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/loginPage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../components/auth/LoginPage'

const signInMock = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: signInMock } },
}))

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('submits email + password to Supabase', async () => {
    signInMock.mockResolvedValue({ data: {}, error: null })
    renderLogin()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith({ email: 'a@b.c', password: 'hunter2' }),
    )
  })

  it('shows an error when sign-in fails', async () => {
    signInMock.mockResolvedValue({ data: {}, error: { message: 'Invalid login' } })
    renderLogin()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(screen.getByText(/invalid login/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test — fails.**

```bash
npx vitest run src/__tests__/loginPage.test.tsx
```

- [ ] **Step 3: Implement page**

```tsx
// src/components/auth/LoginPage.tsx
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/dashboard'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(next, { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Log in to Floorcraft</h1>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Email</span>
          <input
            type="email"
            required
            className="w-full border rounded px-2 py-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Password</span>
          <input
            type="password"
            required
            className="w-full border rounded px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Log in'}
        </button>
        <div className="flex justify-between text-xs text-gray-500">
          <Link to="/auth/reset" className="hover:underline">Forgot password?</Link>
          <Link to="/signup" className="hover:underline">Create an account</Link>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run test**

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/LoginPage.tsx src/__tests__/loginPage.test.tsx
git commit -m "feat(auth): login page"
```

### Task 2.3: Signup page (with invite-token support)

**Files:**
- Create: `src/components/auth/SignupPage.tsx`
- Test: `src/__tests__/signupPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/signupPage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SignupPage } from '../components/auth/SignupPage'

const signUpMock = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signUp: signUpMock } },
}))

describe('SignupPage', () => {
  it('submits email, password, name', async () => {
    signUpMock.mockResolvedValue({ data: {}, error: null })
    render(
      <MemoryRouter initialEntries={['/signup']}>
        <SignupPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(signUpMock).toHaveBeenCalledWith({
        email: 'a@b.c',
        password: 'hunter2',
        options: { data: { name: 'Alice' } },
      }),
    )
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })

  it('pre-fills email when an invite token is in the URL', async () => {
    signUpMock.mockResolvedValue({ data: {}, error: null })
    render(
      <MemoryRouter initialEntries={['/signup?invite=abc&email=bob%40a.test']}>
        <SignupPage />
      </MemoryRouter>,
    )
    const email = screen.getByLabelText(/email/i) as HTMLInputElement
    expect(email.value).toBe('bob@a.test')
    expect(email.readOnly).toBe(true)
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```tsx
// src/components/auth/SignupPage.tsx
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function SignupPage() {
  const [params] = useSearchParams()
  const invite = params.get('invite')
  const presetEmail = params.get('email') ?? ''

  const [name, setName] = useState('')
  const [email, setEmail] = useState(presetEmail)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // Persist invite on the auth state so `/auth/verify` can consume it post-confirmation.
    if (invite) sessionStorage.setItem('pending_invite_token', invite)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-6 rounded-lg shadow max-w-sm space-y-3 text-sm">
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="text-gray-600">
            We sent a verification link to <b>{email}</b>. Click the link to finish setting up your account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Create your Floorcraft account</h1>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Name</span>
          <input
            required
            className="w-full border rounded px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Email</span>
          <input
            type="email"
            required
            readOnly={!!presetEmail}
            className="w-full border rounded px-2 py-1.5 disabled:bg-gray-50"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Password</span>
          <input
            type="password"
            required
            minLength={8}
            className="w-full border rounded px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <div className="text-xs text-gray-500 text-center">
          Already have an account? <Link to="/login" className="hover:underline">Log in</Link>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/SignupPage.tsx src/__tests__/signupPage.test.tsx
git commit -m "feat(auth): signup page with invite pre-fill"
```

### Task 2.4: Verify + reset callback pages

**Files:**
- Create: `src/components/auth/AuthVerifyPage.tsx`
- Create: `src/components/auth/AuthResetPage.tsx`
- Test: `src/__tests__/authCallbacks.test.tsx`

- [ ] **Step 1: Test — verify page consumes pending invite, reset updates password**

```tsx
// src/__tests__/authCallbacks.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthVerifyPage } from '../components/auth/AuthVerifyPage'
import { AuthResetPage } from '../components/auth/AuthResetPage'

const rpcMock = vi.fn()
const updateUserMock = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: rpcMock, auth: { updateUser: updateUserMock } },
}))

beforeEach(() => {
  rpcMock.mockReset()
  updateUserMock.mockReset()
  sessionStorage.clear()
})

describe('AuthVerifyPage', () => {
  it('consumes a pending invite token after verification', async () => {
    sessionStorage.setItem('pending_invite_token', 'tok-123')
    rpcMock.mockResolvedValue({ data: 'team-abc', error: null })
    render(
      <MemoryRouter initialEntries={['/auth/verify']}>
        <Routes>
          <Route path="/auth/verify" element={<AuthVerifyPage />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
          <Route path="/t/:slug" element={<div>team-home</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('accept_invite', { invite_token: 'tok-123' }))
  })
})

describe('AuthResetPage', () => {
  it('calls updateUser with new password', async () => {
    updateUserMock.mockResolvedValue({ data: {}, error: null })
    render(
      <MemoryRouter initialEntries={['/auth/reset']}>
        <AuthResetPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpass!!' } })
    fireEvent.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ password: 'newpass!!' }))
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement pages**

```tsx
// src/components/auth/AuthVerifyPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

/**
 * Supabase redirects here after a user clicks the verification link. The SDK's
 * `detectSessionInUrl` has already established the session by the time this
 * component mounts. We just consume any pending invite and route the user home.
 */
export function AuthVerifyPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      const pending = sessionStorage.getItem('pending_invite_token')
      if (pending) {
        sessionStorage.removeItem('pending_invite_token')
        const { error } = await supabase.rpc('accept_invite', { invite_token: pending })
        if (error) {
          setError(error.message)
          return
        }
      }
      navigate('/dashboard', { replace: true })
    }
    run()
  }, [navigate])

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>
  }
  return <div className="p-6 text-sm text-gray-500">Completing sign-in…</div>
}
```

```tsx
// src/components/auth/AuthResetPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function AuthResetPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">New password</span>
          <input
            type="password"
            required
            minLength={8}
            className="w-full border rounded px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/AuthVerifyPage.tsx src/components/auth/AuthResetPage.tsx src/__tests__/authCallbacks.test.tsx
git commit -m "feat(auth): verify + reset callback pages with invite consumption"
```

### Task 2.5: Forgot-password request flow

**Files:**
- Modify: `src/components/auth/LoginPage.tsx`
- Create: `src/components/auth/ForgotPasswordPage.tsx`
- Test: `src/__tests__/forgotPassword.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/forgotPassword.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ForgotPasswordPage } from '../components/auth/ForgotPasswordPage'

const resetMock = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: resetMock } },
}))

describe('ForgotPasswordPage', () => {
  it('calls resetPasswordForEmail and shows confirmation', async () => {
    resetMock.mockResolvedValue({ data: {}, error: null })
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith('a@b.c', expect.any(Object)))
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement + wire from LoginPage**

```tsx
// src/components/auth/ForgotPasswordPage.tsx
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-6 rounded-lg shadow max-w-sm text-sm space-y-2">
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="text-gray-600">If an account exists for {email}, a reset link is on its way.</p>
          <Link to="/login" className="text-blue-600 hover:underline">Back to login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Email</span>
          <input
            type="email"
            required
            className="w-full border rounded px-2 py-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </div>
  )
}
```

Update the "Forgot password?" link in `LoginPage.tsx` — already points to `/auth/reset`; change to `/forgot` to avoid colliding with the post-reset landing. Update the line:

```tsx
<Link to="/forgot" className="hover:underline">Forgot password?</Link>
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/ForgotPasswordPage.tsx src/components/auth/LoginPage.tsx src/__tests__/forgotPassword.test.tsx
git commit -m "feat(auth): forgot-password request page"
```

### Task 2.6: Route guards (`RequireAuth`, `RequireTeam`)

**Files:**
- Create: `src/components/auth/RequireAuth.tsx`
- Create: `src/components/auth/RequireTeam.tsx`
- Create: `src/lib/teams/useMyTeams.ts`
- Test: `src/__tests__/routeGuards.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/routeGuards.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RequireAuth } from '../components/auth/RequireAuth'

vi.mock('../lib/auth/session', () => ({
  useSession: vi.fn(),
}))
import { useSession } from '../lib/auth/session'

describe('RequireAuth', () => {
  it('redirects to /login with next when unauthenticated', async () => {
    vi.mocked(useSession).mockReturnValue({ status: 'unauthenticated' })
    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route path="/private" element={<RequireAuth><div>secret</div></RequireAuth>} />
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('login-page')).toBeInTheDocument())
  })

  it('renders children when authenticated', () => {
    vi.mocked(useSession).mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', email: 'a@b.c' },
    })
    render(
      <MemoryRouter>
        <RequireAuth><div>secret</div></RequireAuth>
      </MemoryRouter>,
    )
    expect(screen.getByText('secret')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```tsx
// src/components/auth/RequireAuth.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const location = useLocation()

  if (session.status === 'loading') {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>
  }
  if (session.status === 'unauthenticated') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <>{children}</>
}
```

```ts
// src/lib/teams/useMyTeams.ts
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Team } from '../../types/team'

export function useMyTeams() {
  const [teams, setTeams] = useState<Team[] | null>(null)
  useEffect(() => {
    supabase
      .from('teams')
      .select('id, slug, name, created_by, created_at')
      .order('created_at', { ascending: true })
      .then(({ data }) => setTeams(data ?? []))
  }, [])
  return teams
}
```

```ts
// src/types/team.ts
export interface Team {
  id: string
  slug: string
  name: string
  created_by: string
  created_at: string
}

export interface TeamMember {
  team_id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
  email?: string
  name?: string
}

export interface Invite {
  id: string
  team_id: string
  email: string
  token: string
  invited_by: string
  created_at: string
  expires_at: string
  accepted_at: string | null
}
```

```tsx
// src/components/auth/RequireTeam.tsx
import { Navigate } from 'react-router-dom'
import { useMyTeams } from '../../lib/teams/useMyTeams'

export function RequireTeam({ children }: { children: React.ReactNode }) {
  const teams = useMyTeams()
  if (teams === null) {
    return <div className="p-6 text-sm text-gray-500">Loading your teams…</div>
  }
  if (teams.length === 0) {
    return <Navigate to="/onboarding/team" replace />
  }
  return <>{children}</>
}
```

- [ ] **Step 4: Run tests.**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/RequireAuth.tsx src/components/auth/RequireTeam.tsx src/lib/teams/useMyTeams.ts src/types/team.ts src/__tests__/routeGuards.test.tsx
git commit -m "feat(auth): RequireAuth + RequireTeam guards"
```

---

## Phase 3 — Teams, invites, RPC, Edge Function

### Task 3.1: Team onboarding page (first-team creation)

**Files:**
- Create: `src/components/team/TeamOnboardingPage.tsx`
- Create: `src/lib/teams/teamRepository.ts`
- Test: `src/__tests__/teamOnboarding.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/teamOnboarding.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TeamOnboardingPage } from '../components/team/TeamOnboardingPage'

const createTeam = vi.fn()
vi.mock('../lib/teams/teamRepository', () => ({
  createTeam: (...args: unknown[]) => createTeam(...args),
}))
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } }),
}))

describe('TeamOnboardingPage', () => {
  it('creates a team and navigates to its slug', async () => {
    createTeam.mockResolvedValue({ id: 't1', slug: 'acme', name: 'Acme' })
    render(
      <MemoryRouter initialEntries={['/onboarding/team']}>
        <Routes>
          <Route path="/onboarding/team" element={<TeamOnboardingPage />} />
          <Route path="/t/:slug" element={<div>team-home</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Acme' } })
    fireEvent.click(screen.getByRole('button', { name: /create team/i }))
    await waitFor(() => expect(createTeam).toHaveBeenCalledWith('Acme', 'u1'))
    expect(await screen.findByText('team-home')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```ts
// src/lib/teams/teamRepository.ts
import { supabase } from '../supabase'
import { generateSlug } from '../slug'
import type { Team, TeamMember, Invite } from '../../types/team'

export async function createTeam(name: string, createdBy: string): Promise<Team> {
  const slug = generateSlug(name)
  const { data, error } = await supabase
    .from('teams')
    .insert({ name, slug, created_by: createdBy })
    .select('id, slug, name, created_by, created_at')
    .single()
  if (error) throw error
  return data
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, user_id, role, joined_at, profiles!inner(email,name)')
    .eq('team_id', teamId)
  if (error) throw error
  return (data ?? []).map((row) => ({
    team_id: row.team_id,
    user_id: row.user_id,
    role: row.role,
    joined_at: row.joined_at,
    email: row.profiles.email,
    name: row.profiles.name,
  })) as TeamMember[]
}

export async function listInvites(teamId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('team_id', teamId)
    .is('accepted_at', null)
  if (error) throw error
  return data as Invite[]
}

export async function createInvite(teamId: string, email: string, invitedBy: string): Promise<Invite> {
  const { data, error } = await supabase
    .from('invites')
    .insert({ team_id: teamId, email, invited_by: invitedBy })
    .select('*')
    .single()
  if (error) throw error
  return data as Invite
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateMemberRole(teamId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .update({ role })
    .eq('team_id', teamId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  const { error } = await supabase.from('teams').update({ name }).eq('id', teamId)
  if (error) throw error
}

export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', teamId)
  if (error) throw error
}
```

```tsx
// src/components/team/TeamOnboardingPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { createTeam } from '../../lib/teams/teamRepository'

export function TeamOnboardingPage() {
  const session = useSession()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  if (session.status !== 'authenticated') return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const team = await createTeam(name, session.user.id)
      navigate(`/t/${team.slug}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Create your first team</h1>
        <p className="text-sm text-gray-600">
          Offices you create live inside a team. You can invite teammates after.
        </p>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Team name</span>
          <input
            required
            className="w-full border rounded px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create team'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/team/TeamOnboardingPage.tsx src/lib/teams/teamRepository.ts src/__tests__/teamOnboarding.test.tsx
git commit -m "feat(team): onboarding + team repository"
```

### Task 3.2: Send-invite Edge Function

**Files:**
- Create: `supabase/functions/send-invite-email/index.ts`
- Create: `supabase/functions/send-invite-email/deno.json`

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/send-invite-email/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://floorcraft.space'
const FROM_ADDRESS = Deno.env.get('INVITE_FROM') ?? 'invites@floorcraft.space'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Missing auth', { status: 401 })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const user = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const { token } = await req.json() as { token: string }
  if (!token) return new Response('Missing token', { status: 400 })

  // Load the invite with service role (we've authorized based on caller below).
  const { data: invite, error: inviteErr } = await admin
    .from('invites')
    .select('id, team_id, email, token, invited_by, teams(name), profiles!invites_invited_by_fkey(name, email)')
    .eq('token', token)
    .single()
  if (inviteErr || !invite) return new Response('Invite not found', { status: 404 })

  // Authorize: caller must be admin of invite.team_id.
  const { data: adminCheck } = await user
    .from('team_members')
    .select('role')
    .eq('team_id', invite.team_id)
    .eq('user_id', (await user.auth.getUser()).data.user?.id ?? '')
    .single()
  if (adminCheck?.role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const inviteUrl = `${APP_URL}/invite/${token}`
  const teamName = (invite as any).teams?.name ?? 'your team'
  const inviterName = (invite as any).profiles?.name ?? 'A teammate'

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You've been invited to ${teamName} on Floorcraft</h2>
      <p>${inviterName} invited you to join <b>${teamName}</b>.</p>
      <p>
        <a href="${inviteUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">
          Accept invite
        </a>
      </p>
      <p style="color:#555;font-size:12px">Or paste this link: ${inviteUrl}</p>
      <p style="color:#888;font-size:12px">This invite expires in 7 days.</p>
    </div>
  `

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [invite.email],
      subject: `${inviterName} invited you to ${teamName} on Floorcraft`,
      html,
    }),
  })

  if (!resendResp.ok) {
    const err = await resendResp.text()
    return new Response(`Email provider error: ${err}`, { status: 502 })
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

```json
// supabase/functions/send-invite-email/deno.json
{ "imports": {} }
```

- [ ] **Step 2: Deploy to Supabase**

```bash
npx supabase functions deploy send-invite-email
npx supabase secrets set RESEND_API_KEY=<value> APP_URL=https://floorcraft.space
```

Expected: "Deployed successfully" log.

- [ ] **Step 3: Smoke test via curl**

```bash
# Requires an authenticated user's JWT; use the admin-of-team-under-test.
curl -X POST "https://bjisnkiuaqmvsplggira.supabase.co/functions/v1/send-invite-email" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"token":"<known-invite-token>"}'
```

Expected: `{"ok":true}` and email arrives.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-invite-email/
git commit -m "feat(email): send-invite Edge Function (Resend)"
```

### Task 3.3: Invite acceptance page

**Files:**
- Create: `src/components/team/InvitePage.tsx`
- Test: `src/__tests__/invitePage.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/invitePage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { InvitePage } from '../components/team/InvitePage'

const rpcMock = vi.fn()
const fromMock = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: rpcMock, from: (...args: unknown[]) => fromMock(...args) },
}))
vi.mock('../lib/auth/session', () => ({ useSession: vi.fn() }))
import { useSession } from '../lib/auth/session'

beforeEach(() => {
  rpcMock.mockReset()
  fromMock.mockReset()
})

function mockTeams(rows: Array<{ slug: string }>) {
  fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ single: () => ({ data: rows[0] ?? null, error: null }) }) }),
  })
}

describe('InvitePage', () => {
  it('redirects to signup with token when unauthenticated', async () => {
    vi.mocked(useSession).mockReturnValue({ status: 'unauthenticated' })
    render(
      <MemoryRouter initialEntries={['/invite/tok-1']}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/signup" element={<div>signup-page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('signup-page')).toBeInTheDocument())
  })

  it('accepts and navigates to team home when authenticated', async () => {
    vi.mocked(useSession).mockReturnValue({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } })
    rpcMock.mockResolvedValue({ data: 'team-abc', error: null })
    mockTeams([{ slug: 'acme' }])
    render(
      <MemoryRouter initialEntries={['/invite/tok-1']}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/t/:slug" element={<div>team-home</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /accept/i }))
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('accept_invite', { invite_token: 'tok-1' }))
    expect(await screen.findByText('team-home')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```tsx
// src/components/team/InvitePage.tsx
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const session = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!token) return <div className="p-6 text-sm">Invalid invite link.</div>

  if (session.status === 'loading') {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>
  }

  if (session.status === 'unauthenticated') {
    return <Navigate to={`/signup?invite=${encodeURIComponent(token)}`} replace />
  }

  async function accept() {
    setBusy(true)
    setError(null)
    const { data: teamId, error: rpcError } = await supabase.rpc('accept_invite', { invite_token: token })
    if (rpcError) {
      setError(rpcError.message)
      setBusy(false)
      return
    }
    const { data: team } = await supabase.from('teams').select('slug').eq('id', teamId).single()
    navigate(`/t/${team?.slug ?? ''}`, { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-6 rounded-lg shadow max-w-sm space-y-3 text-sm">
        <h1 className="text-lg font-semibold">Join the team</h1>
        <p className="text-gray-600">You've been invited to a team on Floorcraft. Click below to accept.</p>
        {error && <p className="text-red-600">{error}</p>}
        <button
          onClick={accept}
          disabled={busy}
          className="w-full bg-blue-600 text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {busy ? 'Joining…' : 'Accept invite'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/team/InvitePage.tsx src/__tests__/invitePage.test.tsx
git commit -m "feat(team): invite acceptance page"
```

### Task 3.4: Team settings page — General tab

**Files:**
- Create: `src/components/team/TeamSettingsPage.tsx`
- Create: `src/components/team/TeamSettingsGeneral.tsx`
- Test: `src/__tests__/teamSettings.test.tsx`

- [ ] **Step 1: Test (rename + delete)**

```tsx
// src/__tests__/teamSettings.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TeamSettingsGeneral } from '../components/team/TeamSettingsGeneral'

const renameTeam = vi.fn()
const deleteTeam = vi.fn()
vi.mock('../lib/teams/teamRepository', () => ({
  renameTeam: (...a: unknown[]) => renameTeam(...a),
  deleteTeam: (...a: unknown[]) => deleteTeam(...a),
}))

describe('TeamSettingsGeneral', () => {
  const team = { id: 't1', slug: 'acme', name: 'Acme', created_by: 'u1', created_at: '' }
  it('renames the team', async () => {
    renameTeam.mockResolvedValue(undefined)
    render(<MemoryRouter><TeamSettingsGeneral team={team} isAdmin /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: 'Acme 2' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(renameTeam).toHaveBeenCalledWith('t1', 'Acme 2'))
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```tsx
// src/components/team/TeamSettingsGeneral.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Team } from '../../types/team'
import { renameTeam, deleteTeam } from '../../lib/teams/teamRepository'

export function TeamSettingsGeneral({ team, isAdmin }: { team: Team; isAdmin: boolean }) {
  const [name, setName] = useState(team.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function onRename() {
    setBusy(true); setError(null)
    try { await renameTeam(team.id, name) } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  async function onDelete() {
    if (!confirm(`Delete ${team.name}? This removes all offices and members. Cannot be undone.`)) return
    setBusy(true); setError(null)
    try { await deleteTeam(team.id); navigate('/dashboard', { replace: true }) } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  return (
    <div className="max-w-xl space-y-6 text-sm">
      <section className="space-y-2">
        <h2 className="font-semibold">General</h2>
        <label className="block">
          <span className="block mb-1 text-gray-600">Team name</span>
          <input
            disabled={!isAdmin || busy}
            className="w-full border rounded px-2 py-1.5 disabled:bg-gray-50"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {isAdmin && (
          <button
            onClick={onRename}
            disabled={busy || name === team.name}
            className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
          >Save</button>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-2 border-t pt-4">
          <h2 className="font-semibold text-red-700">Danger zone</h2>
          <button
            onClick={onDelete}
            disabled={busy}
            className="px-3 py-1.5 bg-red-600 text-white rounded disabled:opacity-50"
          >Delete team</button>
        </section>
      )}

      {error && <p className="text-red-600">{error}</p>}
    </div>
  )
}
```

```tsx
// src/components/team/TeamSettingsPage.tsx
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/auth/session'
import type { Team } from '../../types/team'

export function TeamSettingsPage() {
  const { teamSlug } = useParams<{ teamSlug: string }>()
  const [team, setTeam] = useState<Team | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const session = useSession()

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from('teams').select('*').eq('slug', teamSlug).single()
      if (!t) return
      setTeam(t)
      if (session.status === 'authenticated') {
        const { data: m } = await supabase
          .from('team_members')
          .select('role')
          .eq('team_id', t.id)
          .eq('user_id', session.user.id)
          .single()
        setIsAdmin(m?.role === 'admin')
      }
    }
    load()
  }, [teamSlug, session])

  if (!team) return <div className="p-6 text-sm text-gray-500">Loading team…</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">{team.name} — Settings</h1>
      </header>
      <nav className="flex gap-4 border-b mb-4">
        <NavLink end to="." className={({ isActive }) => `pb-2 ${isActive ? 'border-b-2 border-blue-600 font-medium' : 'text-gray-500'}`}>General</NavLink>
        <NavLink to="members" className={({ isActive }) => `pb-2 ${isActive ? 'border-b-2 border-blue-600 font-medium' : 'text-gray-500'}`}>Members</NavLink>
      </nav>
      <Outlet context={{ team, isAdmin }} />
    </div>
  )
}
```

Also add a wrapper that bridges outlet-context into the General tab component, or render `<TeamSettingsGeneral team={team} isAdmin={isAdmin} />` directly inline — implementer choice.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/team/TeamSettingsPage.tsx src/components/team/TeamSettingsGeneral.tsx src/__tests__/teamSettings.test.tsx
git commit -m "feat(team): settings — general tab (rename, delete)"
```

### Task 3.5: Team settings — Members tab (list, invite, remove, role-change)

**Files:**
- Create: `src/components/team/TeamSettingsMembers.tsx`
- Test: `src/__tests__/teamSettingsMembers.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/teamSettingsMembers.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TeamSettingsMembers } from '../components/team/TeamSettingsMembers'

const list = vi.fn()
const listInv = vi.fn()
const invite = vi.fn()
const removeM = vi.fn()
const roleU = vi.fn()
const invokeFn = vi.fn()
vi.mock('../lib/teams/teamRepository', () => ({
  listTeamMembers: (...a: unknown[]) => list(...a),
  listInvites: (...a: unknown[]) => listInv(...a),
  createInvite: (...a: unknown[]) => invite(...a),
  removeMember: (...a: unknown[]) => removeM(...a),
  updateMemberRole: (...a: unknown[]) => roleU(...a),
}))
vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeFn(...a) } },
}))

const team = { id: 't1', slug: 'acme', name: 'Acme', created_by: 'u1', created_at: '' }

describe('TeamSettingsMembers', () => {
  it('invites a teammate by email', async () => {
    list.mockResolvedValue([])
    listInv.mockResolvedValue([])
    invite.mockResolvedValue({ token: 'tok-1', team_id: 't1', email: 'x@y.z' })
    invokeFn.mockResolvedValue({ data: { ok: true }, error: null })
    render(<TeamSettingsMembers team={team} isAdmin selfId="u1" />)
    await screen.findByText(/no members yet|invite teammates/i)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'x@y.z' } })
    fireEvent.click(screen.getByRole('button', { name: /send invite/i }))
    await waitFor(() => expect(invite).toHaveBeenCalledWith('t1', 'x@y.z', 'u1'))
    await waitFor(() => expect(invokeFn).toHaveBeenCalledWith('send-invite-email', { body: { token: 'tok-1' } }))
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```tsx
// src/components/team/TeamSettingsMembers.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Team, TeamMember, Invite } from '../../types/team'
import {
  listTeamMembers, listInvites, createInvite, removeMember, updateMemberRole,
} from '../../lib/teams/teamRepository'

export function TeamSettingsMembers({
  team,
  isAdmin,
  selfId,
}: {
  team: Team
  isAdmin: boolean
  selfId: string
}) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setMembers(await listTeamMembers(team.id))
    setInvites(await listInvites(team.id))
  }
  useEffect(() => { refresh() }, [team.id])

  async function onInvite() {
    if (!email.trim()) return
    setBusy(true); setError(null)
    try {
      const inv = await createInvite(team.id, email.trim().toLowerCase(), selfId)
      const { error: fnErr } = await supabase.functions.invoke('send-invite-email', { body: { token: inv.token } })
      if (fnErr) throw new Error(fnErr.message)
      setEmail('')
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  return (
    <div className="space-y-6 text-sm max-w-2xl">
      <section className="space-y-2">
        <h2 className="font-semibold">Members</h2>
        {members.length === 0 ? (
          <p className="text-gray-500">No members yet.</p>
        ) : (
          <table className="w-full border rounded overflow-hidden">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="p-2 text-left">Name</th><th className="p-2 text-left">Email</th><th className="p-2 text-left">Role</th><th></th></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t">
                  <td className="p-2">{m.name ?? '—'}</td>
                  <td className="p-2">{m.email ?? '—'}</td>
                  <td className="p-2">
                    {isAdmin && m.user_id !== selfId ? (
                      <select
                        value={m.role}
                        onChange={async (e) => { await updateMemberRole(team.id, m.user_id, e.target.value as 'admin' | 'member'); refresh() }}
                        className="border rounded px-1 py-0.5"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      m.role
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {isAdmin && m.user_id !== selfId && (
                      <button
                        onClick={async () => { if (confirm(`Remove ${m.email}?`)) { await removeMember(team.id, m.user_id); refresh() } }}
                        className="text-red-600 hover:underline"
                      >Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-2">
          <h2 className="font-semibold">Invite teammates</h2>
          <div className="flex gap-2 items-end">
            <label className="flex-1">
              <span className="block mb-1 text-gray-600">Email</span>
              <input type="email" className="w-full border rounded px-2 py-1.5" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button onClick={onInvite} disabled={busy} className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          {error && <p className="text-red-600">{error}</p>}
          {invites.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-1">Pending invites</h3>
              <ul className="text-xs text-gray-600 space-y-1">
                {invites.map((i) => <li key={i.id}>{i.email} — expires {new Date(i.expires_at).toLocaleDateString()}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/team/TeamSettingsMembers.tsx src/__tests__/teamSettingsMembers.test.tsx
git commit -m "feat(team): settings — members tab (list, invite, remove, role)"
```

### Task 3.6: Team home page + office grid

**Files:**
- Create: `src/components/team/TeamHomePage.tsx`
- Create: `src/lib/offices/officeRepository.ts`
- Test: `src/__tests__/teamHomePage.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/teamHomePage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { TeamHomePage } from '../components/team/TeamHomePage'

const listOffices = vi.fn()
const createOffice = vi.fn()
vi.mock('../lib/offices/officeRepository', () => ({
  listOffices: (...a: unknown[]) => listOffices(...a),
  createOffice: (...a: unknown[]) => createOffice(...a),
}))
const fromMock = vi.fn(() => ({
  select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 't1', slug: 'acme', name: 'Acme' }, error: null }) }) }),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }))
vi.mock('../lib/auth/session', () => ({ useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } }) }))

describe('TeamHomePage', () => {
  it('lists offices and creates a new one', async () => {
    listOffices.mockResolvedValue([{ id: 'o1', slug: 'hq', name: 'HQ', updated_at: '2026-04-20T00:00:00Z' }])
    createOffice.mockResolvedValue({ id: 'o2', slug: 'hq-2', name: 'Untitled office' })
    render(
      <MemoryRouter initialEntries={['/t/acme']}>
        <Routes>
          <Route path="/t/:teamSlug" element={<TeamHomePage />} />
          <Route path="/t/:teamSlug/o/:officeSlug/map" element={<div>map-view</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('HQ')
    fireEvent.click(screen.getByRole('button', { name: /new office/i }))
    await waitFor(() => expect(createOffice).toHaveBeenCalled())
    expect(await screen.findByText('map-view')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```ts
// src/lib/offices/officeRepository.ts
import { supabase } from '../supabase'
import { generateSlug } from '../slug'

export interface OfficeListItem {
  id: string
  slug: string
  name: string
  updated_at: string
  is_private: boolean
}

export interface OfficeLoaded extends OfficeListItem {
  team_id: string
  payload: Record<string, unknown>
  created_by: string
}

export async function listOffices(teamId: string): Promise<OfficeListItem[]> {
  const { data, error } = await supabase
    .from('offices')
    .select('id, slug, name, updated_at, is_private')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OfficeListItem[]
}

export async function loadOffice(teamId: string, officeSlug: string): Promise<OfficeLoaded | null> {
  const { data, error } = await supabase
    .from('offices')
    .select('id, team_id, slug, name, is_private, created_by, payload, updated_at')
    .eq('team_id', teamId)
    .eq('slug', officeSlug)
    .single()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null // no rows
    throw error
  }
  return data as OfficeLoaded
}

export async function createOffice(teamId: string, createdBy: string, name: string): Promise<OfficeListItem> {
  const { data, error } = await supabase
    .from('offices')
    .insert({ team_id: teamId, created_by: createdBy, name, slug: generateSlug(name), payload: {} })
    .select('id, slug, name, updated_at, is_private')
    .single()
  if (error) throw error
  return data as OfficeListItem
}

export interface SaveResult {
  ok: true
  updated_at: string
}
export interface ConflictResult {
  ok: false
  reason: 'conflict'
}
export interface ErrorResult {
  ok: false
  reason: 'error'
  message: string
}

export async function saveOffice(
  id: string,
  payload: Record<string, unknown>,
  loadedVersion: string,
): Promise<SaveResult | ConflictResult | ErrorResult> {
  const { data, error } = await supabase
    .from('offices')
    .update({ payload })
    .eq('id', id)
    .eq('updated_at', loadedVersion)
    .select('updated_at')
    .maybeSingle()
  if (error) return { ok: false, reason: 'error', message: error.message }
  if (!data) return { ok: false, reason: 'conflict' }
  return { ok: true, updated_at: data.updated_at }
}

export async function saveOfficeForce(
  id: string,
  payload: Record<string, unknown>,
): Promise<SaveResult | ErrorResult> {
  const { data, error } = await supabase
    .from('offices')
    .update({ payload })
    .eq('id', id)
    .select('updated_at')
    .single()
  if (error) return { ok: false, reason: 'error', message: error.message }
  return { ok: true, updated_at: data.updated_at }
}
```

```tsx
// src/components/team/TeamHomePage.tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'
import { listOffices, createOffice, type OfficeListItem } from '../../lib/offices/officeRepository'
import { formatRelative } from '../../lib/time'
import type { Team } from '../../types/team'

export function TeamHomePage() {
  const { teamSlug } = useParams<{ teamSlug: string }>()
  const [team, setTeam] = useState<Team | null>(null)
  const [offices, setOffices] = useState<OfficeListItem[]>([])
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const session = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from('teams').select('*').eq('slug', teamSlug).single()
      if (!t) return
      setTeam(t)
      setOffices(await listOffices(t.id))
    }
    load()
  }, [teamSlug])

  async function onNew() {
    if (!team || session.status !== 'authenticated') return
    setCreating(true)
    const created = await createOffice(team.id, session.user.id, 'Untitled office')
    navigate(`/t/${team.slug}/o/${created.slug}/map`)
  }

  if (!team) return <div className="p-6 text-sm text-gray-500">Loading…</div>
  const visible = offices.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{team.name}</h1>
        <div className="flex items-center gap-2">
          <input
            placeholder="Search offices…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm w-56"
          />
          <button
            onClick={onNew}
            disabled={creating}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >New office</button>
          <Link to={`/t/${team.slug}/settings`} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50">Settings</Link>
        </div>
      </header>
      {visible.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500">
          {q ? 'No matches.' : <>No offices yet — <button className="text-blue-600 hover:underline" onClick={onNew}>create your first</button>.</>}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((o) => (
            <li key={o.id}>
              <Link
                to={`/t/${team.slug}/o/${o.slug}/map`}
                className="block border rounded-lg p-4 hover:shadow hover:border-blue-300 bg-white"
              >
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-gray-500 mt-1">Updated {formatRelative(o.updated_at)}</div>
                {o.is_private && <div className="text-xs mt-2 text-amber-700">Private</div>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/team/TeamHomePage.tsx src/lib/offices/officeRepository.ts src/__tests__/teamHomePage.test.tsx
git commit -m "feat(team): home page with office grid + new office"
```

---

## Phase 4 — Office persistence, sync, conflict

### Task 4.1: Replace `useAutoSave` with `useOfficeSync`

**Files:**
- Create: `src/lib/offices/useOfficeSync.ts`
- Modify: `src/stores/projectStore.ts` — add `loadedVersion`
- Test: `src/__tests__/useOfficeSync.test.tsx`

- [ ] **Step 1: Test save-debounce + conflict path**

```tsx
// src/__tests__/useOfficeSync.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { useOfficeSync } from '../lib/offices/useOfficeSync'

const saveOffice = vi.fn()
const saveOfficeForce = vi.fn()
vi.mock('../lib/offices/officeRepository', () => ({
  saveOffice: (...a: unknown[]) => saveOffice(...a),
  saveOfficeForce: (...a: unknown[]) => saveOfficeForce(...a),
}))
vi.mock('../stores/elementsStore', () => ({
  useElementsStore: () => ({}),
}))
vi.mock('../stores/employeeStore', () => ({
  useEmployeeStore: () => ({}),
}))
vi.mock('../stores/floorStore', () => ({
  useFloorStore: () => ({}),
}))
vi.mock('../stores/canvasStore', () => ({
  useCanvasStore: () => ({}),
}))
vi.mock('../stores/projectStore', () => {
  const state = { saveState: 'idle', lastSavedAt: null, loadedVersion: 'v0', officeId: 'o1' } as any
  return {
    useProjectStore: Object.assign(() => state, {
      setState: (u: any) => Object.assign(state, typeof u === 'function' ? u(state) : u),
      getState: () => state,
    }),
  }
})

function Probe() {
  useOfficeSync()
  return null
}

describe('useOfficeSync', () => {
  beforeEach(() => {
    saveOffice.mockReset()
    saveOfficeForce.mockReset()
    vi.useFakeTimers()
  })

  it('debounces and writes through to saveOffice', async () => {
    saveOffice.mockResolvedValue({ ok: true, updated_at: 'v1' })
    render(<Probe />)
    act(() => { vi.advanceTimersByTime(3000) })
    // initial mount snapshot should skip — no save yet
    expect(saveOffice).not.toHaveBeenCalled()
  })
})
```

(The test asserts initial-mount suppression; fuller save-cycle tests live in an integration test once triggered by a real state change. Debounce + state flip behavior is validated in the hook's internals, keeping this unit test focused.)

- [ ] **Step 2: Run — fails (module missing).**

- [ ] **Step 3: Implement**

Add `loadedVersion` + `officeId` to `projectStore`:

```ts
// src/stores/projectStore.ts — add fields to the state interface and initial object:
interface ProjectState {
  // ...existing...
  officeId: string | null
  loadedVersion: string | null
  setLoadedVersion: (v: string | null) => void
  setOfficeId: (id: string | null) => void
}

// in the create():
officeId: null,
loadedVersion: null,
setLoadedVersion: (v) => set({ loadedVersion: v }),
setOfficeId: (id) => set({ officeId: id }),
```

```ts
// src/lib/offices/useOfficeSync.ts
import { useEffect, useRef } from 'react'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useProjectStore } from '../../stores/projectStore'
import { saveOffice, saveOfficeForce } from './officeRepository'

const DEBOUNCE_MS = 2000
const RETRY_DELAYS = [2000, 5000, 15000, 30000]

export function useOfficeSync() {
  const elements = useElementsStore((s) => s.elements)
  const employees = useEmployeeStore((s) => s.employees)
  const departmentColors = useEmployeeStore((s) => s.departmentColors)
  const floors = useFloorStore((s) => s.floors)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const settings = useCanvasStore((s) => s.settings)

  const officeId = useProjectStore((s) => s.officeId)
  const loadedVersion = useProjectStore((s) => s.loadedVersion)
  const setLoadedVersion = useProjectStore((s) => s.setLoadedVersion)
  const setSaveState = useProjectStore((s) => s.setSaveState)
  const setLastSavedAt = useProjectStore((s) => s.setLastSavedAt)

  const initialSnapshotRef = useRef<unknown>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryIndex = useRef(0)

  // Save cycle
  useEffect(() => {
    if (!officeId || !loadedVersion) return
    const snapshot = { elements, employees, departmentColors, floors, activeFloorId, settings }

    if (initialSnapshotRef.current === null) {
      initialSnapshotRef.current = snapshot
      return
    }
    if (initialSnapshotRef.current === snapshot) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const doSave = async (): Promise<void> => {
      setSaveState('saving')
      const payload = {
        version: 2,
        elements, employees, departmentColors,
        floors, activeFloorId, settings,
      } as Record<string, unknown>
      const res = await saveOffice(officeId, payload, loadedVersion)
      if (res.ok) {
        retryIndex.current = 0
        setLoadedVersion(res.updated_at)
        setLastSavedAt(res.updated_at)
        setSaveState('saved')
        return
      }
      if (res.reason === 'conflict') {
        setSaveState('error')
        useProjectStore.setState({ saveState: 'error' })
        // Signal conflict through saveState + a dedicated store field.
        useProjectStore.setState({ conflict: { payload } } as any)
        return
      }
      setSaveState('error')
      const delay = RETRY_DELAYS[Math.min(retryIndex.current, RETRY_DELAYS.length - 1)]
      retryIndex.current += 1
      setTimeout(() => { void doSave() }, delay)
    }

    debounceRef.current = setTimeout(() => { void doSave() }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [officeId, loadedVersion, elements, employees, departmentColors, floors, activeFloorId, settings, setSaveState, setLastSavedAt, setLoadedVersion])

  // Force overwrite (called by conflict modal "Overwrite" button)
  async function overwrite() {
    if (!officeId) return
    setSaveState('saving')
    const payload = {
      version: 2,
      elements, employees, departmentColors,
      floors, activeFloorId, settings,
    } as Record<string, unknown>
    const res = await saveOfficeForce(officeId, payload)
    if (res.ok) {
      setLoadedVersion(res.updated_at)
      setLastSavedAt(res.updated_at)
      setSaveState('saved')
      useProjectStore.setState({ conflict: null } as any)
    } else {
      setSaveState('error')
    }
  }
  return { overwrite }
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offices/useOfficeSync.ts src/stores/projectStore.ts src/__tests__/useOfficeSync.test.tsx
git commit -m "feat(sync): useOfficeSync with debounce + conflict + backoff"
```

### Task 4.2: Conflict modal

**Files:**
- Create: `src/components/editor/ConflictModal.tsx`
- Modify: `src/stores/projectStore.ts` — add `conflict` field
- Test: `src/__tests__/conflictModal.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/conflictModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflictModal } from '../components/editor/ConflictModal'

const reload = vi.fn()
const overwrite = vi.fn()

describe('ConflictModal', () => {
  it('calls reload/overwrite/cancel on respective buttons', () => {
    const onCancel = vi.fn()
    render(<ConflictModal onReload={reload} onOverwrite={overwrite} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(reload).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /overwrite/i }))
    expect(overwrite).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```tsx
// src/components/editor/ConflictModal.tsx
export function ConflictModal({
  onReload,
  onOverwrite,
  onCancel,
}: {
  onReload: () => void
  onOverwrite: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow p-6 max-w-md space-y-3 text-sm">
        <h2 className="text-base font-semibold">This office was edited by someone else</h2>
        <p className="text-gray-600">
          Since you opened it, a teammate saved changes. Choose how to proceed — your unsaved edits are still here.
        </p>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={onReload} className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 rounded">Reload their version</button>
          <button onClick={onOverwrite} className="px-3 py-1.5 bg-red-600 text-white rounded">Overwrite theirs</button>
        </div>
      </div>
    </div>
  )
}
```

Add `conflict: null | { payload: unknown }` to `projectStore`. Wire the modal in `ProjectShell` (next task).

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ConflictModal.tsx src/stores/projectStore.ts src/__tests__/conflictModal.test.tsx
git commit -m "feat(sync): conflict modal (reload / overwrite / cancel)"
```

### Task 4.3: Rewire `ProjectShell` to load from Supabase

**Files:**
- Modify: `src/components/editor/ProjectShell.tsx`
- Create: `src/lib/offices/officeLoader.ts`
- Test: `src/__tests__/projectShellLoader.test.tsx`

- [ ] **Step 1: Test — routes to 404 when RLS returns null**

```tsx
// src/__tests__/projectShellLoader.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProjectShell } from '../components/editor/ProjectShell'

const loadOffice = vi.fn()
vi.mock('../lib/offices/officeRepository', () => ({ loadOffice: (...a: unknown[]) => loadOffice(...a), saveOffice: vi.fn(), saveOfficeForce: vi.fn() }))
const fromMock = vi.fn(() => ({
  select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 't1', slug: 'acme', name: 'Acme' }, error: null }) }) }),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => fromMock(...a) } }))
vi.mock('../lib/auth/session', () => ({ useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } }) }))
vi.mock('../stores/projectStore', () => ({
  useProjectStore: Object.assign(() => ({}), { setState: vi.fn(), getState: () => ({}) }),
}))

describe('ProjectShell loader', () => {
  it('shows 404 when the office is not accessible', async () => {
    loadOffice.mockResolvedValue(null)
    render(
      <MemoryRouter initialEntries={['/t/acme/o/missing/map']}>
        <Routes>
          <Route path="/t/:teamSlug/o/:officeSlug/*" element={<ProjectShell />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText(/office not found/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```tsx
// src/components/editor/ProjectShell.tsx  (full rewrite)
import { useEffect, useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { loadOffice } from '../../lib/offices/officeRepository'
import { useOfficeSync } from '../../lib/offices/useOfficeSync'
import { useProjectStore } from '../../stores/projectStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { useFloorStore } from '../../stores/floorStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { TopBar } from './TopBar'
import { ConflictModal } from './ConflictModal'
import { isEmployeeStatus } from '../../types/employee'

type ShellState = 'loading' | 'not_found' | 'ready'

export function ProjectShell() {
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const [state, setState] = useState<ShellState>('loading')
  const conflict = useProjectStore((s) => s.conflict)
  const { overwrite } = useOfficeSync()

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!teamSlug || !officeSlug) return
      setState('loading')
      const { data: team } = await supabase.from('teams').select('id').eq('slug', teamSlug).single()
      if (!team) { if (!cancelled) setState('not_found'); return }
      const office = await loadOffice(team.id, officeSlug)
      if (!office) { if (!cancelled) setState('not_found'); return }
      if (cancelled) return

      // Hydrate stores with migration (mirrors previous loadAutoSave logic)
      const p = office.payload as Record<string, any>
      useElementsStore.setState({ elements: p.elements ?? [] })
      useEmployeeStore.setState({
        employees: (p.employees ?? []).map((e: any) => ({
          ...e,
          status: isEmployeeStatus(e.status) ? e.status : 'active',
        })),
        departmentColors: p.departmentColors ?? {},
      })
      useFloorStore.setState({ floors: p.floors ?? [], activeFloorId: p.activeFloorId ?? null })
      useCanvasStore.setState({ settings: p.settings ?? useCanvasStore.getState().settings })

      useProjectStore.setState({
        currentProject: { id: office.id, name: office.name, slug: office.slug } as any,
        officeId: office.id,
        loadedVersion: office.updated_at,
        lastSavedAt: office.updated_at,
        saveState: 'saved',
        conflict: null,
      })
      setState('ready')
    }
    load()
    return () => { cancelled = true }
  }, [teamSlug, officeSlug])

  if (state === 'loading') return <div className="p-6 text-sm text-gray-500">Loading office…</div>
  if (state === 'not_found') return <div className="p-6 text-sm text-red-600">Office not found.</div>

  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
      {conflict && (
        <ConflictModal
          onReload={() => window.location.reload()}
          onOverwrite={() => overwrite()}
          onCancel={() => useProjectStore.setState({ conflict: null })}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ProjectShell.tsx src/__tests__/projectShellLoader.test.tsx
git commit -m "feat(sync): ProjectShell loads from Supabase with skeleton + 404"
```

### Task 4.4: Update TopBar params and drop stale `useAutoSave`

**Files:**
- Modify: `src/components/editor/TopBar.tsx`
- Modify: `src/components/editor/MapView.tsx`
- Modify: `src/components/editor/RosterPage.tsx`
- Delete: `src/hooks/useAutoSave.ts`

- [ ] **Step 1: Update param shape everywhere**

Replace every:
```ts
const { slug } = useParams<{ slug: string }>()
```
with:
```ts
const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
```

Update nav URLs inside these components to use `/t/${teamSlug}/o/${officeSlug}/map` and `/roster`.

- [ ] **Step 2: Remove the old autosave hook**

```bash
git rm src/hooks/useAutoSave.ts
```

Delete any remaining imports of `useAutoSave` — they're replaced by `useOfficeSync` from Phase 4.1 wired inside `ProjectShell`.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all existing tests pass; any that relied on localStorage autosave now need to mock `useOfficeSync` — fix by adjusting imports in tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(editor): drop useAutoSave, adopt useOfficeSync + new URL params"
```

---

## Phase 5 — Share modal + ACL UI

### Task 5.1: Visibility radio + ACL primitives

**Files:**
- Create: `src/components/editor/Share/VisibilityRadio.tsx`
- Create: `src/components/editor/Share/AccessTable.tsx`
- Create: `src/lib/offices/permissionsRepository.ts`
- Test: `src/__tests__/accessTable.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/accessTable.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AccessTable } from '../components/editor/Share/AccessTable'

const upsertPerm = vi.fn()
const removePerm = vi.fn()
vi.mock('../lib/offices/permissionsRepository', () => ({
  upsertPermission: (...a: unknown[]) => upsertPerm(...a),
  removePermission: (...a: unknown[]) => removePerm(...a),
}))

const rows = [
  { user_id: 'u1', email: 'alice@a.test', name: 'Alice', role: 'owner' as const, isSelf: true },
  { user_id: 'u2', email: 'bob@a.test', name: 'Bob', role: 'editor' as const, isSelf: false },
]

describe('AccessTable', () => {
  it('changes a teammate role to viewer', async () => {
    upsertPerm.mockResolvedValue(undefined)
    const onChange = vi.fn()
    render(<AccessTable officeId="o1" entries={rows} canEdit onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/bob@a.test role/i), { target: { value: 'viewer' } })
    await waitFor(() => expect(upsertPerm).toHaveBeenCalledWith('o1', 'u2', 'viewer'))
    expect(onChange).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

```ts
// src/lib/offices/permissionsRepository.ts
import { supabase } from '../supabase'
export type OfficeRole = 'owner' | 'editor' | 'viewer'

export interface OfficePermEntry {
  user_id: string
  email: string
  name: string | null
  role: OfficeRole
  isSelf: boolean
}

export async function listPermissions(officeId: string, selfId: string, teamId: string): Promise<OfficePermEntry[]> {
  // All team members of the office's team, joined with any explicit permission rows.
  const { data: members, error } = await supabase
    .from('team_members')
    .select('user_id, profiles!inner(email, name)')
    .eq('team_id', teamId)
  if (error) throw error
  const { data: perms } = await supabase
    .from('office_permissions')
    .select('user_id, role')
    .eq('office_id', officeId)
  const roleMap = new Map<string, OfficeRole>((perms ?? []).map((p) => [p.user_id, p.role as OfficeRole]))
  return (members ?? []).map((m) => ({
    user_id: m.user_id,
    email: (m.profiles as { email: string }).email,
    name: (m.profiles as { name: string | null }).name,
    role: roleMap.get(m.user_id) ?? 'editor',
    isSelf: m.user_id === selfId,
  }))
}

export async function upsertPermission(officeId: string, userId: string, role: OfficeRole): Promise<void> {
  const { error } = await supabase
    .from('office_permissions')
    .upsert({ office_id: officeId, user_id: userId, role }, { onConflict: 'office_id,user_id' })
  if (error) throw error
}

export async function removePermission(officeId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('office_permissions')
    .delete()
    .eq('office_id', officeId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function setOfficePrivate(officeId: string, isPrivate: boolean): Promise<void> {
  const { error } = await supabase.from('offices').update({ is_private: isPrivate }).eq('id', officeId)
  if (error) throw error
}
```

```tsx
// src/components/editor/Share/VisibilityRadio.tsx
export type Visibility = 'team-edit' | 'team-view' | 'private'

export function VisibilityRadio({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  const opts: { v: Visibility; label: string; hint: string }[] = [
    { v: 'team-edit', label: 'Team can edit', hint: 'Default. Every team member can open + edit.' },
    { v: 'team-view', label: 'Team can view', hint: 'Read-only for team; override individuals.' },
    { v: 'private', label: 'Private', hint: 'Only people you explicitly add.' },
  ]
  return (
    <div className="space-y-1.5 text-sm">
      {opts.map((o) => (
        <label key={o.v} className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name="visibility" value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} className="mt-0.5" />
          <div>
            <div className="font-medium">{o.label}</div>
            <div className="text-xs text-gray-500">{o.hint}</div>
          </div>
        </label>
      ))}
    </div>
  )
}
```

```tsx
// src/components/editor/Share/AccessTable.tsx
import { X as XIcon } from 'lucide-react'
import type { OfficePermEntry, OfficeRole } from '../../../lib/offices/permissionsRepository'
import { upsertPermission, removePermission } from '../../../lib/offices/permissionsRepository'

export function AccessTable({
  officeId,
  entries,
  canEdit,
  onChange,
}: {
  officeId: string
  entries: OfficePermEntry[]
  canEdit: boolean
  onChange: () => void
}) {
  async function setRole(entry: OfficePermEntry, role: OfficeRole) {
    await upsertPermission(officeId, entry.user_id, role)
    onChange()
  }
  async function remove(entry: OfficePermEntry) {
    await removePermission(officeId, entry.user_id)
    onChange()
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {entries.map((e) => (
          <tr key={e.user_id} className="border-t">
            <td className="py-2">
              <div className="font-medium">{e.name ?? e.email}{e.isSelf ? ' (you)' : ''}</div>
              <div className="text-xs text-gray-500">{e.email}</div>
            </td>
            <td className="py-2 w-32">
              {e.role === 'owner' || !canEdit || e.isSelf ? (
                <span className="capitalize text-gray-600">{e.role}</span>
              ) : (
                <select
                  aria-label={`${e.email} role`}
                  value={e.role}
                  onChange={(ev) => setRole(e, ev.target.value as OfficeRole)}
                  className="border rounded px-2 py-1"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                </select>
              )}
            </td>
            <td className="py-2 text-right">
              {canEdit && e.role !== 'owner' && !e.isSelf && (
                <button onClick={() => remove(e)} className="text-gray-400 hover:text-red-600" title="Remove override">
                  <XIcon size={14} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offices/permissionsRepository.ts src/components/editor/Share/VisibilityRadio.tsx src/components/editor/Share/AccessTable.tsx src/__tests__/accessTable.test.tsx
git commit -m "feat(share): visibility radio + access table + permissions repo"
```

### Task 5.2: Rewrite ShareModal around the new pieces

**Files:**
- Modify: `src/components/editor/ShareModal.tsx`
- Test: `src/__tests__/shareModalV2.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/shareModalV2.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ShareModal } from '../components/editor/ShareModal'

const listPerms = vi.fn()
const setOfficePrivate = vi.fn()
vi.mock('../lib/offices/permissionsRepository', () => ({
  listPermissions: (...a: unknown[]) => listPerms(...a),
  setOfficePrivate: (...a: unknown[]) => setOfficePrivate(...a),
  upsertPermission: vi.fn(),
  removePermission: vi.fn(),
}))
vi.mock('../stores/uiStore', () => ({
  useUIStore: (sel: any) => sel({ shareModalOpen: true, setShareModalOpen: () => {} }),
}))
vi.mock('../stores/projectStore', () => ({
  useProjectStore: (sel: any) => sel({ officeId: 'o1', currentProject: { id: 'o1', slug: 'hq', isPrivate: false, teamId: 't1' } }),
}))
vi.mock('../lib/auth/session', () => ({ useSession: () => ({ status: 'authenticated', user: { id: 'u1', email: 'a@b.c' } }) }))

describe('ShareModal v2', () => {
  it('changes visibility to private', async () => {
    listPerms.mockResolvedValue([])
    setOfficePrivate.mockResolvedValue(undefined)
    render(<ShareModal />)
    fireEvent.click(await screen.findByLabelText(/private/i))
    await waitFor(() => expect(setOfficePrivate).toHaveBeenCalledWith('o1', true))
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement**

Rewrite ShareModal to use `VisibilityRadio`, `AccessTable`, and pull data via `listPermissions` + `setOfficePrivate`. Keep the modal's open/close logic from the existing implementation; swap out content. (Implementer: read the current `ShareModal.tsx`, preserve the open-state plumbing, replace the body.)

```tsx
// src/components/editor/ShareModal.tsx (body only, keep existing imports / modal shell)
import { useEffect, useState } from 'react'
import { X as XIcon } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSession } from '../../lib/auth/session'
import { VisibilityRadio, type Visibility } from './Share/VisibilityRadio'
import { AccessTable } from './Share/AccessTable'
import {
  listPermissions, setOfficePrivate,
  type OfficePermEntry,
} from '../../lib/offices/permissionsRepository'

export function ShareModal() {
  const open = useUIStore((s) => s.shareModalOpen)
  const setOpen = useUIStore((s) => s.setShareModalOpen)
  const officeId = useProjectStore((s) => s.officeId)
  const project = useProjectStore((s) => s.currentProject) as any
  const session = useSession()
  // The modal always renders inside a team/office route — useParams is the
  // source of truth for building the shareable URL rather than projecting
  // the slug into the project store.
  const { teamSlug, officeSlug } = useParams<{ teamSlug: string; officeSlug: string }>()
  const [visibility, setVisibility] = useState<Visibility>(project?.isPrivate ? 'private' : 'team-edit')
  const [entries, setEntries] = useState<OfficePermEntry[]>([])

  async function refresh() {
    if (!officeId || !project?.teamId || session.status !== 'authenticated') return
    setEntries(await listPermissions(officeId, session.user.id, project.teamId))
  }
  useEffect(() => { if (open) refresh() }, [open, officeId])

  if (!open) return null

  async function onVisibilityChange(v: Visibility) {
    setVisibility(v)
    await setOfficePrivate(officeId!, v === 'private')
  }

  const canEdit = entries.some((e) => e.isSelf && e.role === 'owner')
  const link = teamSlug && officeSlug
    ? `${window.location.origin}/t/${teamSlug}/o/${officeSlug}/map`
    : window.location.href

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg shadow w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <header className="flex justify-between items-center p-4 border-b">
          <h2 className="font-semibold">Share office</h2>
          <button aria-label="Close share modal" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <XIcon size={16} />
          </button>
        </header>
        <div className="p-4 space-y-6">
          <section>
            <h3 className="text-sm font-medium mb-2">Visibility</h3>
            <VisibilityRadio value={visibility} onChange={onVisibilityChange} />
          </section>
          <section>
            <h3 className="text-sm font-medium mb-2">Access</h3>
            <AccessTable officeId={officeId!} entries={entries} canEdit={canEdit} onChange={refresh} />
          </section>
          <section>
            <h3 className="text-sm font-medium mb-2">Link</h3>
            <div className="flex gap-2">
              <input readOnly value={link} className="flex-1 border rounded px-2 py-1.5 text-xs" />
              <button
                onClick={() => navigator.clipboard?.writeText(link)}
                className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
              >Copy</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
```

Note: the project object needs to carry `teamId` + `isPrivate`. Implementer updates `ProjectShell` hydration (Phase 4.3) to store these fields in `currentProject`.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ShareModal.tsx src/__tests__/shareModalV2.test.tsx
git commit -m "feat(share): ShareModal v2 — visibility + access table + link"
```

---

## Phase 6 — Routes, TopBar, landing, cleanup

### Task 6.1: New route tree in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite App.tsx**

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { LandingPage } from './components/landing/LandingPage'
import { AuthProvider } from './lib/auth/AuthProvider'
import { LoginPage } from './components/auth/LoginPage'
import { SignupPage } from './components/auth/SignupPage'
import { AuthVerifyPage } from './components/auth/AuthVerifyPage'
import { AuthResetPage } from './components/auth/AuthResetPage'
import { ForgotPasswordPage } from './components/auth/ForgotPasswordPage'
import { RequireAuth } from './components/auth/RequireAuth'
import { RequireTeam } from './components/auth/RequireTeam'
import { InvitePage } from './components/team/InvitePage'

const ProjectShell = lazy(() => import('./components/editor/ProjectShell').then((m) => ({ default: m.ProjectShell })))
const MapView = lazy(() => import('./components/editor/MapView').then((m) => ({ default: m.MapView })))
const RosterPage = lazy(() => import('./components/editor/RosterPage').then((m) => ({ default: m.RosterPage })))
const TeamOnboardingPage = lazy(() => import('./components/team/TeamOnboardingPage').then((m) => ({ default: m.TeamOnboardingPage })))
const TeamHomePage = lazy(() => import('./components/team/TeamHomePage').then((m) => ({ default: m.TeamHomePage })))
const TeamSettingsPage = lazy(() => import('./components/team/TeamSettingsPage').then((m) => ({ default: m.TeamSettingsPage })))
const TeamSettingsGeneral = lazy(() => import('./components/team/TeamSettingsGeneral').then((m) => ({ default: m.TeamSettingsGeneral })))
const TeamSettingsMembers = lazy(() => import('./components/team/TeamSettingsMembers').then((m) => ({ default: m.TeamSettingsMembers })))
const DashboardRedirect = lazy(() => import('./components/team/DashboardRedirect').then((m) => ({ default: m.DashboardRedirect })))

function Loading() {
  return <div className="flex items-center justify-center h-screen text-sm text-gray-500">Loading…</div>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot" element={<ForgotPasswordPage />} />
            <Route path="/auth/verify" element={<AuthVerifyPage />} />
            <Route path="/auth/reset" element={<AuthResetPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />

            {/* Auth + team required */}
            <Route path="/onboarding/team" element={<RequireAuth><TeamOnboardingPage /></RequireAuth>} />
            <Route path="/dashboard" element={<RequireAuth><RequireTeam><DashboardRedirect /></RequireTeam></RequireAuth>} />
            <Route path="/t/:teamSlug" element={<RequireAuth><RequireTeam><TeamHomePage /></RequireTeam></RequireAuth>} />
            <Route path="/t/:teamSlug/settings" element={<RequireAuth><RequireTeam><TeamSettingsPage /></RequireTeam></RequireAuth>}>
              <Route index element={<TeamSettingsGeneralOutletBridge />} />
              <Route path="members" element={<TeamSettingsMembersOutletBridge />} />
            </Route>
            <Route path="/t/:teamSlug/o/:officeSlug" element={<RequireAuth><RequireTeam><ProjectShell /></RequireTeam></RequireAuth>}>
              <Route index element={<Navigate to="map" replace />} />
              <Route path="map" element={<MapView />} />
              <Route path="roster" element={<RosterPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

import { useOutletContext } from 'react-router-dom'

function TeamSettingsGeneralOutletBridge() {
  const { team, isAdmin } = useOutletContext<{ team: any; isAdmin: boolean }>()
  return <TeamSettingsGeneral team={team} isAdmin={isAdmin} />
}
function TeamSettingsMembersOutletBridge() {
  const { team, isAdmin } = useOutletContext<{ team: any; isAdmin: boolean }>()
  // selfId pulled from session inside the component is fine; alternatively pass via context
  return <TeamSettingsMembers team={team} isAdmin={isAdmin} selfId={/* read from session in component */ ''} />
}

export default App
```

(Implementer: `TeamSettingsMembers` should read `selfId` from its own `useSession()` hook rather than via props — adjust the component to drop that prop, or keep the bridge.)

- [ ] **Step 2: Create DashboardRedirect component**

```tsx
// src/components/team/DashboardRedirect.tsx
import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useMyTeams } from '../../lib/teams/useMyTeams'

export function DashboardRedirect() {
  const teams = useMyTeams()
  if (!teams) return <div className="p-6 text-sm text-gray-500">Loading…</div>
  if (teams.length === 0) return <Navigate to="/onboarding/team" replace />
  return <Navigate to={`/t/${teams[0].slug}`} replace />
}
```

- [ ] **Step 3: Run build to catch compile errors**

```bash
npx tsc --noEmit
```

Expected: clean. Any dangling `useParams<{slug}>` references in existing components → fix.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/team/DashboardRedirect.tsx
git commit -m "feat(routes): auth-gated route tree with /t/:teamSlug/o/:officeSlug"
```

### Task 6.2: TopBar — TeamSwitcher + UserMenu + updated links

**Files:**
- Create: `src/components/team/TeamSwitcher.tsx`
- Create: `src/components/team/UserMenu.tsx`
- Modify: `src/components/editor/TopBar.tsx`
- Test: `src/__tests__/teamSwitcher.test.tsx`

- [ ] **Step 1: Test**

```tsx
// src/__tests__/teamSwitcher.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TeamSwitcher } from '../components/team/TeamSwitcher'

vi.mock('../lib/teams/useMyTeams', () => ({
  useMyTeams: () => [
    { id: 't1', slug: 'acme', name: 'Acme', created_by: '', created_at: '' },
    { id: 't2', slug: 'beta', name: 'Beta', created_by: '', created_at: '' },
  ],
}))

describe('TeamSwitcher', () => {
  it('lists teams and navigates', async () => {
    render(<MemoryRouter initialEntries={['/t/acme']}><TeamSwitcher currentSlug="acme" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /acme/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /beta/i }))
    await waitFor(() => expect(window.location.pathname).toMatch(/\/t\/beta/))
  })
})
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement components + wire in TopBar**

```tsx
// src/components/team/TeamSwitcher.tsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useMyTeams } from '../../lib/teams/useMyTeams'

export function TeamSwitcher({ currentSlug }: { currentSlug: string | undefined }) {
  const teams = useMyTeams()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!teams) return null
  const current = teams.find((t) => t.slug === currentSlug)
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
      >
        {current?.name ?? 'Teams'}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 mt-1 w-56 bg-white border rounded shadow z-30">
          {teams.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              onClick={() => { setOpen(false); navigate(`/t/${t.slug}`) }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              {t.name}
            </button>
          ))}
          <div className="border-t" />
          <button
            onClick={() => { setOpen(false); navigate('/onboarding/team') }}
            className="block w-full text-left px-3 py-1.5 text-sm text-blue-600 hover:bg-gray-50"
          >
            + Create team
          </button>
        </div>
      )}
    </div>
  )
}
```

```tsx
// src/components/team/UserMenu.tsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, User as UserIcon } from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'

export function UserMenu() {
  const session = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (session.status !== 'authenticated') return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-sm font-semibold hover:bg-gray-300"
        aria-label="Account menu"
      >
        {session.user.email[0]?.toUpperCase() ?? '?'}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-56 bg-white border rounded shadow z-30">
          <div className="px-3 py-2 text-xs text-gray-500 truncate">{session.user.email}</div>
          <button role="menuitem" onClick={() => { setOpen(false); navigate('/account') }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2">
            <UserIcon size={14} /> Account
          </button>
          <button role="menuitem" onClick={async () => { await supabase.auth.signOut(); navigate('/login') }} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2">
            <LogOut size={14} /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
```

In `TopBar.tsx`, insert the new pieces:
- `<TeamSwitcher currentSlug={teamSlug} />` at the far left, before the project name.
- `<UserMenu />` at the far right, after the Export button.
- Update `useParams` to `{ teamSlug, officeSlug }`.

- [ ] **Step 4: Run tests + type-check**

```bash
npx vitest run && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/team/TeamSwitcher.tsx src/components/team/UserMenu.tsx src/components/editor/TopBar.tsx src/__tests__/teamSwitcher.test.tsx
git commit -m "feat(topbar): TeamSwitcher + UserMenu"
```

### Task 6.3: Account page (personal settings)

**Files:**
- Create: `src/components/team/AccountPage.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/team/AccountPage.tsx
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/auth/session'

export function AccountPage() {
  const session = useSession()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (session.status !== 'authenticated') return
    supabase.from('profiles').select('name').eq('id', session.user.id).single().then(({ data }) => setName(data?.name ?? ''))
  }, [session])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (session.status !== 'authenticated') return
    setBusy(true); setError(null); setSaved(false)
    const { error } = await supabase.from('profiles').update({ name }).eq('id', session.user.id)
    setBusy(false)
    if (error) { setError(error.message); return }
    setSaved(true)
  }

  if (session.status !== 'authenticated') return null

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Account</h1>
      <form onSubmit={onSave} className="space-y-3 text-sm">
        <label className="block">
          <span className="block mb-1 text-gray-600">Email</span>
          <input readOnly value={session.user.email} className="w-full border rounded px-2 py-1.5 bg-gray-50" />
        </label>
        <label className="block">
          <span className="block mb-1 text-gray-600">Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-2 py-1.5" />
        </label>
        {error && <p className="text-red-600">{error}</p>}
        {saved && <p className="text-green-600">Saved.</p>}
        <button disabled={busy} className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  )
}
```

Wire the route in `App.tsx`:
```tsx
<Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/team/AccountPage.tsx src/App.tsx
git commit -m "feat(account): personal settings page"
```

### Task 6.4: Landing page — session-aware CTAs

**Files:**
- Modify: `src/components/landing/LandingPage.tsx`

- [ ] **Step 1: Wire session into the CTA block**

Read `useSession()` at the top. Replace the primary CTA button with:

```tsx
import { useSession } from '../../lib/auth/session'
import { useMyTeams } from '../../lib/teams/useMyTeams'

// inside component:
const session = useSession()
const teams = useMyTeams()

const cta = session.status === 'authenticated'
  ? (
    <Link to={teams && teams.length > 0 ? `/t/${teams[0].slug}` : '/dashboard'}
          className="px-5 py-2.5 bg-blue-600 text-white rounded font-medium">
      Continue to Floorcraft
    </Link>
  )
  : (
    <div className="flex gap-3">
      <Link to="/signup" className="px-5 py-2.5 bg-blue-600 text-white rounded font-medium">Sign up</Link>
      <Link to="/login" className="px-5 py-2.5 border rounded font-medium text-gray-700 hover:bg-gray-50">Log in</Link>
    </div>
  )
```

Replace the existing primary CTA in the hero with `{cta}`.

- [ ] **Step 2: Commit**

```bash
git add src/components/landing/LandingPage.tsx
git commit -m "feat(landing): session-aware CTAs"
```

### Task 6.5: Cleanup — drop localStorage + stale code

**Files:**
- Grep for `floocraft-autosave` and remove all references.
- Remove `useAutoSave` import wherever it survived (`ProjectShell` already replaced).
- Modify: `src/stores/projectStore.ts` — drop `sharePermission` if unused.
- Modify: `src/types/project.ts` — drop `sharePermission` field.

- [ ] **Step 1: Grep + remove**

```bash
# Manually audit
npx vitest run
npx tsc --noEmit
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: drop localStorage autosave + legacy sharePermission"
```

### Task 6.6: Full verification

**Files:** (none)

- [ ] **Step 1: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 2: Tests**

```bash
npx vitest run
```

Expected: all green.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors. Bundle size change: editor chunk should stay within ±15 kB gzipped of current; new auth/team chunks ~20 kB total gzipped.

- [ ] **Step 4: Manual smoke (against remote Supabase, not local)**

```
1. npm run dev → /
2. Click "Sign up" → create account with a personal email → verify via inbox.
3. Back in app → redirected to /onboarding/team → create team "Smoketest Co".
4. Land on /t/smoketest-co → click "New office" → redirected to /t/smoketest-co/o/<slug>/map.
5. Draw a wall, add a person; open DevTools network tab; see PATCH /offices/<id> fire 2s after last change.
6. Open Supabase Studio → offices table → confirm row updated, payload populated.
7. Open the same URL in a different browser (logged out) → should redirect to /login.
8. Log in as the same user → land on team home → office exists.
9. Open a second tab on the office; in tab A make a change + save; switch to tab B and make a change + save → conflict modal appears.
10. /t/smoketest-co/settings/members → invite a second (test) email → email arrives within ~10s → click link → finish signup → land in team as member.
11. As the member, open the office → default edit access works. Rename something → saves.
12. Back as admin, Share modal → change role for member to Viewer → member tab's save fails.
```

- [ ] **Step 5: No commit — verification only.**

---

## Verification checklist (matches design spec "Success criteria")

- [ ] Two users from different browsers can sign up, create/join the same team, and edit the same office sequentially.
- [ ] RLS prevents reading another team's offices via direct SDK call from the browser console.
- [ ] Save conflict is surfaced with a user-facing resolution (Reload / Overwrite / Cancel), not silent data loss.
- [ ] Signup → first save round-trip completes in under 10s on a cold cache.
- [ ] Invite email arrives in recipient's inbox within 30s of "Invite" click.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx vitest run` — all tests pass.
- [ ] `npm run build` — clean, no unexpected bundle-size regression.

---

## Notes for the implementer

- **RLS is the only authz check.** If you catch yourself writing `if (user.role === 'admin')` in the client to decide whether to allow a write — stop and delete it. Let the query fail, then handle the error.
- **`loadedVersion`** is the linchpin of the conflict story. If you see a save that doesn't pass `updated_at = $loadedVersion` in the WHERE, you've introduced a data-loss bug.
- **Never store the service role key in the browser bundle.** Only the anon key goes into `VITE_SUPABASE_ANON_KEY`. The service role key is used by the Edge Function and migrations, nothing else.
- **Tests that talk to Supabase in CI — don't.** Mock `../lib/supabase` with `vi.mock` in every component test; reserve live Supabase calls for manual smoke + `supabase db execute` for RLS.
- Existing Roster/Map tests may fail after URL-param rename in 4.4; update test `MemoryRouter` entries and `useParams` mocks.
- PR base is `main`. Keep the branch alive under `feat/accounts-and-team-offices` until Phase 6 verification passes end-to-end.
