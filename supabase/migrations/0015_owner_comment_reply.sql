-- 0015_owner_comment_reply.sql
--
-- Owner-side reply on share-mode comments (#197 follow-up). The
-- write side of comment-mode required a share token (anon callers
-- have no auth.uid()); editors and owners want to reply IN-thread
-- without juggling a share link they didn't open. This migration:
--
--   1. Makes `share_comments.share_token` nullable so an
--      owner-authored comment can omit it. A null token marks the
--      row as an owner reply for display purposes.
--   2. Adds `add_office_comment(p_office_id, p_body, p_author_name)` —
--      SECURITY DEFINER, auth-gated. Verifies the caller is an
--      owner / editor / team admin of the office (mirrors the
--      `share_comments_owner_read` policy from 0014). On success
--      inserts a row with `share_token = null`.

alter table share_comments
  alter column share_token drop not null;

create or replace function public.add_office_comment(
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
  result share_comments;
  trimmed_body text;
  trimmed_name text;
  is_authorized boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  trimmed_body := btrim(p_body);
  if length(trimmed_body) = 0 then
    raise exception 'comment_body_empty';
  end if;
  if length(trimmed_body) > 4000 then
    raise exception 'comment_body_too_long';
  end if;

  trimmed_name := btrim(coalesce(p_author_name, ''));
  if length(trimmed_name) > 80 then
    trimmed_name := substring(trimmed_name from 1 for 80);
  end if;

  -- Owner / editor / team-admin check. Same shape as the
  -- `share_comments_owner_read` policy — keep the two in lockstep.
  select exists (
    select 1 from offices o
    where o.id = p_office_id
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
  ) into is_authorized;

  if not is_authorized then
    raise exception 'forbidden';
  end if;

  insert into share_comments (office_id, share_token, body, author_name)
  values (p_office_id, null, trimmed_body, trimmed_name)
  returning * into result;
  return result;
end;
$$;

revoke all on function public.add_office_comment(uuid, text, text) from public;
grant execute on function public.add_office_comment(uuid, text, text)
  to authenticated;
