-- 0012_share_token_rls_hardening.sql
--
-- Hardens the share-token RLS introduced in 0011. The original policy
--
--   create policy "share_tokens_anon_select"
--     on share_tokens for select
--     using (revoked_at is null);
--
-- allows ANY anon caller to `select * from share_tokens` and harvest
-- every live bearer token, then load every shared office payload via
-- the broad `offices_public_via_share_token` policy. The whole
-- view-only-share-link model is bypassable.
--
-- This migration:
--   1. Drops both anon-broad policies (`share_tokens_anon_select`,
--      `offices_public_via_share_token`).
--   2. Replaces the resolution path with a SECURITY DEFINER RPC
--      `resolve_share_token(text)` that takes the token as input and
--      returns the office record only when the token matches and is
--      not revoked. Anon can call this but cannot enumerate.
--   3. Keeps owner-side management working by adding an authenticated
--      `share_tokens_owner_select` policy so `listShareTokens` (the
--      ShareLinkDialog UI) keeps reading just its owner's tokens.

-- 1. Drop the broad anon-select policies.
drop policy if exists "share_tokens_anon_select" on share_tokens;
drop policy if exists "offices_public_via_share_token" on offices;

-- 2. Replace with an RPC that takes the token as a required input.
--
-- Returns the minimal office record needed to render the read-only
-- shared view. SECURITY DEFINER lets the function read past RLS, but
-- the function only ever returns rows whose token argument matches —
-- without the token, no rows. `set search_path = public` is the
-- standard hardening to stop a hostile schema search-path from
-- shadowing the joined tables.
create or replace function public.resolve_share_token(p_token text)
returns table (
  office_id uuid,
  team_id uuid,
  slug text,
  name text,
  is_private boolean,
  created_by uuid,
  payload jsonb,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    o.id, o.team_id, o.slug, o.name, o.is_private, o.created_by,
    o.payload, o.updated_at
  from share_tokens st
  join offices o on o.id = st.office_id
  where st.token = p_token
    and st.revoked_at is null
  limit 1;
$$;

grant execute on function public.resolve_share_token(text) to anon, authenticated;

-- 3. Owner-side management: keep `listShareTokens` working for the
-- ShareLinkDialog by allowing authenticated owners to SELECT their own
-- offices' tokens. Anon and non-owners get nothing back.
create policy "share_tokens_owner_select"
  on share_tokens for select
  to authenticated
  using (
    exists (
      select 1 from office_permissions op
      where op.office_id = share_tokens.office_id
        and op.user_id = auth.uid()
        and op.role = 'owner'
    )
  );
