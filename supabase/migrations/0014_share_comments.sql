-- 0014_share_comments.sql
--
-- Comment-mode share links (HOP synthesis #2 — buying-motion enabler).
-- Lets a recipient of a `/shared/:projectId/:token` link leave a
-- public comment on the office without authenticating. The most-asked
-- review use case (Maya's CEO) — read the plan, type "the kitchen is
-- too small" — without forcing the reviewer through a signup funnel.
--
-- Security model mirrors `resolve_share_token` (0012): no direct table
-- access for anon; a SECURITY DEFINER RPC takes the token, validates it
-- against `share_tokens` (must match office_id + not revoked), and
-- only then writes / reads. The token is the bearer credential — the
-- RPC enforces it instead of relying on a trust boundary that anon
-- could probe.

create table if not exists share_comments (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  -- The bearer token used to leave the comment. Stored so an
  -- office owner can later filter comments by which share link
  -- received them ("the link I gave the CEO" vs "the link I gave
  -- the architect"). Not unique; one token authors many comments.
  share_token text not null,
  body text not null,
  -- Free-form display name typed by the commenter. We deliberately
  -- DON'T link to auth.users — the whole point of share-mode is the
  -- reviewer hasn't signed up. Empty string falls back to "Anonymous"
  -- in the UI; we don't enforce non-empty server-side because some
  -- viewers want to leave a name-less comment.
  author_name text not null default '',
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists share_comments_office_idx
  on share_comments(office_id, created_at desc);

alter table share_comments enable row level security;

-- No policies = deny-all for the regular table-access path. The
-- SECURITY DEFINER RPCs below are the only way in, exactly mirroring
-- how 0012 hardened share_tokens itself.

-- -----------------------------------------------------------------
-- Add a comment via a valid share token. Validates the token-office
-- pairing inside the function so a hostile caller can't pass a token
-- for one office and an office_id for another.
-- -----------------------------------------------------------------
create or replace function public.add_share_comment(
  p_token text,
  p_office_id uuid,
  p_body text,
  p_author_name text
)
returns share_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  matched int;
  result share_comments;
  trimmed_body text;
  trimmed_name text;
begin
  -- Empty / whitespace-only bodies aren't useful and would clutter the
  -- list. Trim and reject early. Cap to 4 KB so a malicious paste
  -- can't bloat the row.
  trimmed_body := btrim(p_body);
  if length(trimmed_body) = 0 then
    raise exception 'comment_body_empty';
  end if;
  if length(trimmed_body) > 4000 then
    raise exception 'comment_body_too_long';
  end if;

  -- Names are optional; we still cap to 80 chars so the UI doesn't
  -- have to truncate display.
  trimmed_name := btrim(coalesce(p_author_name, ''));
  if length(trimmed_name) > 80 then
    trimmed_name := substring(trimmed_name from 1 for 80);
  end if;

  -- Token-office pairing check. The token must (a) exist, (b) be
  -- live, and (c) point at the office the caller claims. Without (c)
  -- a valid token for office A would let a caller post to office B.
  select 1 into matched
  from share_tokens st
  where st.token = p_token
    and st.office_id = p_office_id
    and st.revoked_at is null
  limit 1;
  if matched is null then
    raise exception 'invalid_or_revoked_token';
  end if;

  insert into share_comments (office_id, share_token, body, author_name)
  values (p_office_id, p_token, trimmed_body, trimmed_name)
  returning * into result;
  return result;
end;
$$;

revoke all on function public.add_share_comment(text, uuid, text, text) from public;
grant execute on function public.add_share_comment(text, uuid, text, text)
  to anon, authenticated;

-- -----------------------------------------------------------------
-- List comments for a shared office. Same token-office pairing check.
-- Returns most-recent first; the UI paginates client-side.
-- -----------------------------------------------------------------
create or replace function public.list_share_comments(
  p_token text,
  p_office_id uuid
)
returns setof share_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  matched int;
begin
  select 1 into matched
  from share_tokens st
  where st.token = p_token
    and st.office_id = p_office_id
    and st.revoked_at is null
  limit 1;
  if matched is null then
    raise exception 'invalid_or_revoked_token';
  end if;

  return query
    select * from share_comments
    where office_id = p_office_id
    order by created_at desc;
end;
$$;

revoke all on function public.list_share_comments(text, uuid) from public;
grant execute on function public.list_share_comments(text, uuid)
  to anon, authenticated;

-- -----------------------------------------------------------------
-- Owner-side read for the editor's "Comments" panel. Owners and
-- editors of an office should be able to see every comment without
-- needing the share token. Mirrors the share_tokens_owner_select
-- pattern from 0012.
-- -----------------------------------------------------------------
create policy "share_comments_owner_read"
  on share_comments for select
  to authenticated
  using (
    exists (
      select 1 from offices o
      where o.id = share_comments.office_id
        and (
          exists (
            select 1 from team_members tm
            where tm.team_id = o.team_id
              and tm.user_id = auth.uid()
              and tm.role = 'admin'
          )
          or exists (
            select 1 from office_permissions op
            where op.office_id = o.id
              and op.user_id = auth.uid()
              and op.role in ('owner', 'editor')
          )
        )
    )
  );
