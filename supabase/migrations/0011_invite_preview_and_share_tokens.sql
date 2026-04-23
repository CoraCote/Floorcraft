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
