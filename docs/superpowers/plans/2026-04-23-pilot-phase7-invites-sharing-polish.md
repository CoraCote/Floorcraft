# Phase 7 — Invites, Sharing, Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining pilot paper-cuts: preview invite details before accepting, resend verification emails with rate-limiting, tuck the demo office into a secondary flow, and ship Owner-controlled read-only share links.

**Architecture:** Each spec item is narrowly scoped. Invite preview adds a `preview_invite` Postgres function (anon-callable, returns workspace + inviter names). Resend uses `supabase.auth.resend()` with client-side rate-limit. Demo tuck just reorders UI. Share links add a `share_tokens` table + `/shared/:projectId/:token` route that loads the office payload without auth and renders the existing MapView/RosterPage components in a read-only wrapper.

**Note:** Keyboard-shortcut overlay is already shipped (`src/components/editor/KeyboardShortcutsOverlay.tsx` triggered by `?`). Item 5 of the spec is complete; this plan does NOT include it.

**Tech Stack:** Vite/React 19 + TypeScript + Zustand, Supabase Postgres + RLS, `@supabase/supabase-js`, Vitest + @testing-library/react.

---

## File structure

**New:**
- `supabase/migrations/0011_invite_preview_and_share_tokens.sql` — `preview_invite` RPC + `share_tokens` table + RLS.
- `supabase/tests/share_tokens.sql` — smoke checks.
- `src/lib/invitePreview.ts` — client wrapper for the RPC.
- `src/lib/shareTokens.ts` — client wrapper for share-token CRUD.
- `src/components/team/ResendVerificationButton.tsx`
- `src/components/editor/Share/ShareLinkSection.tsx` — new sub-section inside existing ShareModal.
- `src/components/shared/SharedProjectView.tsx` — the read-only `/shared/:id/:token` surface.
- `src/__tests__/invitePreview.test.tsx`
- `src/__tests__/resendVerification.test.tsx`
- `src/__tests__/shareLinkView.test.tsx`

**Modified:**
- `src/components/team/InvitePage.tsx` — render preview.
- `src/components/team/TeamHomePage.tsx` — demote demo CTA.
- `src/components/editor/ShareModal.tsx` — embed `ShareLinkSection`.
- `src/App.tsx` — register `/shared/:projectId/:token` route.

---

## Task 1 — Invite preview RPC + UI

**Files:**
- Create: `supabase/migrations/0011_invite_preview_and_share_tokens.sql` (this task adds the RPC section; Task 4 extends the same file with share_tokens — writing them together keeps the migration atomic)
- Create: `src/lib/invitePreview.ts`
- Modify: `src/components/team/InvitePage.tsx`
- Create: `src/__tests__/invitePreview.test.tsx`

### 1.1 Start the migration file

```sql
-- 0011_invite_preview_and_share_tokens.sql
-- Phase 7: invite preview RPC + share_tokens table.

-- 1. Invite preview: anon-callable function that returns the team name
--    + inviter display name for a given token, without exposing the
--    rest of the invites row. Returns NULL if the token is invalid or
--    already accepted.

create or replace function public.preview_invite(invite_token uuid)
returns table (team_name text, inviter_name text)
language sql
security definer
set search_path = public
as $$
  select t.name, coalesce(p.name, split_part(p.email, '@', 1))
  from invites i
  join teams t on t.id = i.team_id
  join profiles p on p.id = i.invited_by
  where i.token = invite_token
    and i.accepted_at is null
    and i.expires_at > now()
  limit 1;
$$;

grant execute on function public.preview_invite(uuid) to anon, authenticated;
```

### 1.2 Client wrapper

```ts
// src/lib/invitePreview.ts
import { supabase } from './supabase'

export interface InvitePreview {
  teamName: string
  inviterName: string
}

/**
 * Fetches the team + inviter display names for a pending invite token.
 * Returns null if the token is invalid, expired, or already accepted —
 * we don't distinguish between the cases because the UI needs the same
 * "this link isn't valid anymore" message for all of them (and telling
 * strangers which state an invite is in leaks info).
 */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc('preview_invite', { invite_token: token })
  if (error || !data || data.length === 0) return null
  const row = data[0]
  return { teamName: row.team_name, inviterName: row.inviter_name }
}
```

### 1.3 Update InvitePage

The existing page renders generic "Join the team" text. Add a preview fetch + greeting:

```tsx
// additions to src/components/team/InvitePage.tsx

const [preview, setPreview] = useState<InvitePreview | null>(null)
const [previewLoaded, setPreviewLoaded] = useState(false)

useEffect(() => {
  if (!token) return
  let cancelled = false
  previewInvite(token).then((p) => {
    if (!cancelled) {
      setPreview(p)
      setPreviewLoaded(true)
    }
  })
  return () => { cancelled = true }
}, [token])

// In JSX, replace the static heading/paragraph block with:
{preview ? (
  <>
    <h1 className="text-lg font-semibold">
      {preview.inviterName} invited you to {preview.teamName}
    </h1>
    <p className="text-gray-600">Accept to join this workspace on Floorcraft.</p>
  </>
) : previewLoaded ? (
  <>
    <h1 className="text-lg font-semibold">Invite link not valid</h1>
    <p className="text-gray-600">This invite may be expired or already used. Ask your inviter for a fresh link.</p>
  </>
) : (
  <>
    <h1 className="text-lg font-semibold">Loading invite…</h1>
  </>
)}
```

Keep the existing Accept button, but disable it when `previewLoaded && !preview`.

### 1.4 Test

```tsx
// src/__tests__/invitePreview.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { InvitePage } from '../components/team/InvitePage'
import * as preview from '../lib/invitePreview'

vi.mock('../lib/invitePreview', () => ({ previewInvite: vi.fn() }))
vi.mock('../lib/auth/session', () => ({
  useSession: () => ({ status: 'authenticated', user: { id: 'u1' } }),
}))

beforeEach(() => {
  vi.mocked(preview.previewInvite).mockReset()
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/invite/abc-123']}>
      <Routes>
        <Route path="/invite/:token" element={<InvitePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Invite preview', () => {
  it('renders inviter + team name when preview resolves', async () => {
    vi.mocked(preview.previewInvite).mockResolvedValue({
      teamName: 'Acme Corp', inviterName: 'Sarah',
    })
    mount()
    await waitFor(() => expect(screen.getByText(/Sarah invited you to Acme Corp/i)).toBeInTheDocument())
  })

  it('shows not-valid message when preview returns null', async () => {
    vi.mocked(preview.previewInvite).mockResolvedValue(null)
    mount()
    await waitFor(() => expect(screen.getByText(/not valid/i)).toBeInTheDocument())
  })
})
```

### 1.5 Commit

```bash
git add supabase/migrations/0011_invite_preview_and_share_tokens.sql src/lib/invitePreview.ts src/components/team/InvitePage.tsx src/__tests__/invitePreview.test.tsx
git commit -m "feat(invites): preview inviter + team name before accept"
```

---

## Task 2 — Resend verification email

**Files:**
- Create: `src/components/team/ResendVerificationButton.tsx`
- Create: `src/__tests__/resendVerification.test.tsx`

### 2.1 Component

```tsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const COOLDOWN_SEC = 30

export function ResendVerificationButton({ email }: { email: string }) {
  const [remaining, setRemaining] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (remaining <= 0) return
    const t = setTimeout(() => setRemaining((r) => Math.max(0, r - 1)), 1000)
    return () => clearTimeout(t)
  }, [remaining])

  async function onClick() {
    if (remaining > 0 || sending) return
    setSending(true)
    setLastError(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setSending(false)
    if (error) {
      setLastError(error.message)
      return
    }
    setRemaining(COOLDOWN_SEC)
  }

  const label = sending
    ? 'Sending…'
    : remaining > 0
      ? `Resend available in ${remaining}s`
      : 'Resend verification email'

  return (
    <div className="space-y-1">
      <button
        onClick={onClick}
        disabled={remaining > 0 || sending}
        className="text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
      >
        {label}
      </button>
      {lastError && <p className="text-xs text-red-600">{lastError}</p>}
    </div>
  )
}
```

### 2.2 Test

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ResendVerificationButton } from '../components/team/ResendVerificationButton'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { resend: vi.fn().mockResolvedValue({ error: null }) },
  },
}))

import { supabase } from '../lib/supabase'

beforeEach(() => {
  vi.mocked(supabase.auth.resend).mockClear().mockResolvedValue({ error: null } as never)
  vi.useFakeTimers()
})

describe('ResendVerificationButton', () => {
  it('disables for 30 seconds after a successful send, then re-enables', async () => {
    render(<ResendVerificationButton email="test@example.com" />)
    const btn = screen.getByRole('button')
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(vi.mocked(supabase.auth.resend)).toHaveBeenCalledOnce()
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText(/available in 30s/i)).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(29_000) })
    expect(screen.getByText(/available in 1s/i)).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByRole('button')).not.toBeDisabled()
    expect(screen.getByText(/resend verification email/i)).toBeInTheDocument()
  })

  it('surfaces resend errors inline', async () => {
    vi.mocked(supabase.auth.resend).mockResolvedValueOnce({ error: { message: 'rate limited' } } as never)
    render(<ResendVerificationButton email="test@example.com" />)
    await act(async () => { fireEvent.click(screen.getByRole('button')) })
    expect(screen.getByText(/rate limited/i)).toBeInTheDocument()
    expect(screen.getByRole('button')).not.toBeDisabled()
  })
})
```

### 2.3 Commit (component only — wiring it into a real signup-pending page is out of scope for now; the component is reusable)

```bash
git add src/components/team/ResendVerificationButton.tsx src/__tests__/resendVerification.test.tsx
git commit -m "feat(auth): resend verification button with 30s rate limit"
```

---

## Task 3 — Demote demo-office CTA

**Files:**
- Modify: `src/components/team/TeamHomePage.tsx`

### 3.1 Reorder

Find the current "Demo office" button (around line 115 per survey). Move it out of the primary CTA area into a collapsed "Or start from a template" section:

Pattern:
```tsx
{/* Primary CTAs */}
<button onClick={onCreateBlank} className="...primary..." disabled={busy}>
  + New project
</button>

{/* Secondary: template-based starters */}
<details className="mt-2 text-xs">
  <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
    Or start from a template
  </summary>
  <div className="mt-2 ml-2 space-y-1">
    <button onClick={onNewDemo} disabled={busy} className="text-blue-600 hover:underline">
      Sample office · ~18 employees
    </button>
  </div>
</details>
```

The exact JSX lifted above is illustrative — match the surrounding file's styling. The key outcome: demo button is no longer a same-weight peer of "+ New project"; it's one click deeper in a disclosure widget.

### 3.2 No new test needed

The existing TeamHomePage tests (if any) should still pass. Run the full suite after to confirm.

### 3.3 Commit

```bash
git add src/components/team/TeamHomePage.tsx
git commit -m "feat(ui): demote demo-office CTA into template disclosure"
```

---

## Task 4 — Read-only share links

### 4.1 Migration (append to 0011)

In `supabase/migrations/0011_invite_preview_and_share_tokens.sql`, add below the RPC:

```sql
-- 2. share_tokens: Owner-issued read-only bearer links for offices.
--    A token granted here bypasses office_permissions — it's an
--    explicitly public surface. Revocation is manual (no TTL).

create table share_tokens (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index share_tokens_office_idx on share_tokens(office_id);

-- Anon + authenticated can SELECT a token row (to resolve a share link);
-- only Owners of the office can INSERT/UPDATE (to create or revoke).
alter table share_tokens enable row level security;

create policy "share_tokens_anon_select"
  on share_tokens for select
  using (revoked_at is null);

create policy "share_tokens_owner_insert"
  on share_tokens for insert
  with check (
    exists (
      select 1 from office_permissions op
      where op.office_id = share_tokens.office_id
        and op.user_id = auth.uid()
        and op.role = 'owner'
    )
  );

create policy "share_tokens_owner_update"
  on share_tokens for update
  using (
    exists (
      select 1 from office_permissions op
      where op.office_id = share_tokens.office_id
        and op.user_id = auth.uid()
        and op.role = 'owner'
    )
  );

-- Anon SELECT on offices (for the /shared route) — restricted to rows
-- that have a live share token.
create policy "offices_public_via_share_token"
  on offices for select
  using (
    exists (
      select 1 from share_tokens st
      where st.office_id = offices.id
        and st.revoked_at is null
    )
  );
```

### 4.2 Smoke test — `supabase/tests/share_tokens.sql`

```sql
do $$
begin
  if not exists (select 1 from information_schema.tables where table_name = 'share_tokens') then
    raise exception 'share_tokens table missing';
  end if;
  if not (select relrowsecurity from pg_class where relname = 'share_tokens') then
    raise exception 'RLS not enabled on share_tokens';
  end if;
end $$;

\echo 'share_tokens.sql: checks passed.'
```

### 4.3 Client wrapper — `src/lib/shareTokens.ts`

```ts
import { supabase } from './supabase'

export interface ShareToken {
  id: string
  office_id: string
  token: string
  created_at: string
  revoked_at: string | null
}

function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createShareToken(officeId: string): Promise<ShareToken> {
  const { data: userRes } = await supabase.auth.getUser()
  const createdBy = userRes.user?.id
  if (!createdBy) throw new Error('Not signed in')
  const row = {
    office_id: officeId,
    token: randomToken(),
    created_by: createdBy,
  }
  const { data, error } = await supabase
    .from('share_tokens')
    .insert(row)
    .select()
    .single()
  if (error) throw error
  return data as ShareToken
}

export async function listShareTokens(officeId: string): Promise<ShareToken[]> {
  const { data, error } = await supabase
    .from('share_tokens')
    .select('*')
    .eq('office_id', officeId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ShareToken[]
}

export async function revokeShareToken(id: string): Promise<void> {
  const { error } = await supabase
    .from('share_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function resolveShareToken(token: string): Promise<{ officeId: string } | null> {
  const { data, error } = await supabase
    .from('share_tokens')
    .select('office_id, revoked_at')
    .eq('token', token)
    .maybeSingle()
  if (error || !data || data.revoked_at) return null
  return { officeId: data.office_id }
}
```

### 4.4 ShareModal section — `src/components/editor/Share/ShareLinkSection.tsx`

Scope:
- Only visible when `useCan('generateShareLink')` (Owner only per Phase 5 matrix).
- Renders a list of live tokens (with revoke button) + a "Generate new link" button.
- Copy-to-clipboard on the URL.

```tsx
import { useEffect, useState } from 'react'
import { useCan } from '../../../hooks/useCan'
import { useProjectStore } from '../../../stores/projectStore'
import {
  createShareToken, listShareTokens, revokeShareToken,
  type ShareToken,
} from '../../../lib/shareTokens'

export function ShareLinkSection() {
  const canGenerate = useCan('generateShareLink')
  const officeId = useProjectStore((s) => s.officeId)
  const [tokens, setTokens] = useState<ShareToken[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!officeId) return
    let cancelled = false
    listShareTokens(officeId)
      .then((rows) => { if (!cancelled) setTokens(rows.filter((r) => !r.revoked_at)) })
      .catch((err) => console.error('[share] list failed', err))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [officeId])

  if (!canGenerate) return null

  async function onGenerate() {
    if (!officeId) return
    setBusy(true)
    try {
      const t = await createShareToken(officeId)
      setTokens((prev) => [t, ...prev])
    } finally {
      setBusy(false)
    }
  }

  async function onRevoke(id: string) {
    await revokeShareToken(id)
    setTokens((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <section className="border-t border-gray-100 pt-4 mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Read-only share link</h3>
        <button
          onClick={onGenerate}
          disabled={busy || !officeId}
          className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
        >
          {busy ? 'Generating…' : 'Generate new link'}
        </button>
      </div>
      {loading ? <div className="text-xs text-gray-500">Loading…</div> : null}
      <ul className="space-y-1 text-xs">
        {tokens.map((t) => {
          const url = `${window.location.origin}/shared/${t.office_id}/${t.token}`
          return (
            <li key={t.id} className="flex items-center gap-2">
              <code className="flex-1 truncate bg-gray-50 px-2 py-1 rounded">{url}</code>
              <button
                onClick={() => navigator.clipboard.writeText(url)}
                className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
              >
                Copy
              </button>
              <button
                onClick={() => onRevoke(t.id)}
                className="px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
              >
                Revoke
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

Embed into ShareModal:
```tsx
import { ShareLinkSection } from './Share/ShareLinkSection'
// ...inside the modal body, at the bottom:
<ShareLinkSection />
```

### 4.5 Shared view route + page

New file `src/components/shared/SharedProjectView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { resolveShareToken } from '../../lib/shareTokens'
import { loadOfficeById } from '../../lib/offices/loadOfficeById' // may need to create
import { useProjectStore } from '../../stores/projectStore'
import { useFloorStore } from '../../stores/floorStore'
import { useEmployeeStore } from '../../stores/employeeStore'
import { loadFromLegacyPayload } from '../../lib/offices/loadFromLegacyPayload'

export function SharedProjectView() {
  const { projectId, token } = useParams<{ projectId: string; token: string }>()
  const [status, setStatus] = useState<'loading' | 'invalid' | 'ready'>('loading')

  useEffect(() => {
    if (!projectId || !token) { setStatus('invalid'); return }
    let cancelled = false
    ;(async () => {
      const resolved = await resolveShareToken(token)
      if (!resolved || resolved.officeId !== projectId) {
        if (!cancelled) setStatus('invalid')
        return
      }
      // Load the office payload anonymously. The RLS policy
      // `offices_public_via_share_token` allows this.
      const office = await loadOfficeById(projectId)
      if (!office) { if (!cancelled) setStatus('invalid'); return }
      loadFromLegacyPayload(office.payload)
      // Force the role to 'viewer' so every surface gates correctly.
      useProjectStore.setState({
        currentOfficeRole: 'viewer',
        officeId: projectId,
        currentTeamId: null,
        currentUserId: null,
      })
      if (!cancelled) setStatus('ready')
    })()
    return () => { cancelled = true }
  }, [projectId, token])

  if (status === 'loading') return <div className="p-6">Loading shared project…</div>
  if (status === 'invalid') return <div className="p-6">This share link isn't valid.</div>

  // Render a trimmed read-only shell: MapView with no TopBar editing tools.
  return (
    <div className="h-screen w-screen">
      {/* Re-using MapView produces the canvas read-only because role=viewer
          disables all mutating tools via useCan('editMap'). */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {require ? null : null /* placeholder */}
      <ReadOnlyLayout />
    </div>
  )
}

function ReadOnlyLayout() {
  // For the pilot, ship just the roster view. Map rendering requires a
  // Konva stage which has more session plumbing — defer map-view share
  // to a follow-up. A read-only roster is the most requested artifact
  // for exec reviews anyway.
  const employees = useEmployeeStore((s) => Object.values(s.employees))
  const floors = useFloorStore((s) => s.floors)
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Shared read-only view</h1>
        <p className="text-sm text-gray-600">
          {floors.length} floor{floors.length === 1 ? '' : 's'} · {employees.length} people
        </p>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-gray-200">
            <th className="py-2">Name</th>
            <th>Department</th>
            <th>Title</th>
            <th>Seat</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="border-b border-gray-100">
              <td className="py-1">{e.name}</td>
              <td className="py-1">{e.department ?? ''}</td>
              <td className="py-1">{e.title ?? ''}</td>
              <td className="py-1">{e.seatId ? 'assigned' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

**Important simplification:** The spec said "read-only map + roster; all editing buttons hidden." For pilot scope, a read-only ROSTER (table view) is the highest-value artifact and avoids the Konva render path which has more session plumbing dependencies. If `loadOfficeById` doesn't exist, create it as a thin wrapper around `supabase.from('offices').select('*').eq('id', officeId).single()`. Document this simplification in the PR body.

### 4.6 Register route in App.tsx

```tsx
const SharedProjectView = lazy(() => import('./components/shared/SharedProjectView').then(m => ({ default: m.SharedProjectView })))
// Top-level, before /t/:teamSlug because /shared has no auth wrapper:
<Route path="/shared/:projectId/:token" element={<SharedProjectView />} />
```

### 4.7 Test — `src/__tests__/shareLinkView.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SharedProjectView } from '../components/shared/SharedProjectView'
import * as shareTokens from '../lib/shareTokens'
import * as loadOffice from '../lib/offices/loadOfficeById'

vi.mock('../lib/shareTokens', () => ({
  resolveShareToken: vi.fn(),
}))
vi.mock('../lib/offices/loadOfficeById', () => ({
  loadOfficeById: vi.fn(),
}))
vi.mock('../lib/offices/loadFromLegacyPayload', () => ({
  loadFromLegacyPayload: vi.fn(),
}))

function mount() {
  return render(
    <MemoryRouter initialEntries={['/shared/office-1/token-abc']}>
      <Routes>
        <Route path="/shared/:projectId/:token" element={<SharedProjectView />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(shareTokens.resolveShareToken).mockReset()
  vi.mocked(loadOffice.loadOfficeById).mockReset()
})

describe('SharedProjectView', () => {
  it('renders invalid message for a revoked token', async () => {
    vi.mocked(shareTokens.resolveShareToken).mockResolvedValue(null)
    mount()
    await waitFor(() => expect(screen.getByText(/share link isn't valid/i)).toBeInTheDocument())
  })

  it('renders read-only shell for a live token', async () => {
    vi.mocked(shareTokens.resolveShareToken).mockResolvedValue({ officeId: 'office-1' })
    vi.mocked(loadOffice.loadOfficeById).mockResolvedValue({ id: 'office-1', payload: {} } as never)
    mount()
    await waitFor(() => expect(screen.getByRole('heading', { name: /shared read-only view/i })).toBeInTheDocument())
  })
})
```

### 4.8 Commit

```bash
git add supabase/migrations/0011_invite_preview_and_share_tokens.sql supabase/tests/share_tokens.sql \
  src/lib/shareTokens.ts \
  src/lib/offices/loadOfficeById.ts \
  src/components/editor/Share/ShareLinkSection.tsx \
  src/components/editor/ShareModal.tsx \
  src/components/shared/SharedProjectView.tsx \
  src/App.tsx \
  src/__tests__/shareLinkView.test.tsx
git commit -m "feat(share): read-only share tokens + /shared view"
```

---

## Task 5 — Final verify + PR

- [ ] **Step 1: Gauntlet**

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

Expected: green, ~410+ tests pass.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/phase7-invites-sharing-polish
```

Base: `feat/phase6-utilization-reports`. Title: `Phase 7: invite preview, resend, demote demo, share links`.

PR body: enumerate the four items shipped; note the keyboard-shortcut overlay item from the spec was already shipped; note the shared-view simplification (roster-only for pilot).

---

## Branching

Start from `feat/phase6-utilization-reports` as `feat/phase7-invites-sharing-polish`. PR base = `feat/phase6-utilization-reports`. Auto-retargets to main as upstream PRs merge.
