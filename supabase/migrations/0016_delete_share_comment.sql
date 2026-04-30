-- 0016_delete_share_comment.sql
--
-- Owner-side delete on share-mode comments. Spam, accidental
-- duplicate posts, and test entries shouldn't stick around. Same
-- auth-gating shape as the read policy (#0014) and write RPC
-- (#0015).
--
-- Permanent delete (no soft-delete column) on the assumption that
-- a comment is either useful or removed. If audit recovery becomes
-- a need we can add a `deleted_at` column without changing the RPC
-- contract.

create or replace function public.delete_share_comment(
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_authorized boolean;
  comment_office_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Look up the comment's office so we can authorize against the
  -- same owner / editor / team-admin set the read policy uses.
  -- A missing comment short-circuits to a `not_found` error so
  -- the caller can tell "we deleted it" from "you didn't have
  -- permission" — both responses without the lookup would be
  -- ambiguous.
  select office_id into comment_office_id
  from share_comments
  where id = p_comment_id;
  if comment_office_id is null then
    raise exception 'not_found';
  end if;

  select exists (
    select 1 from offices o
    where o.id = comment_office_id
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

  delete from share_comments where id = p_comment_id;
end;
$$;

revoke all on function public.delete_share_comment(uuid) from public;
grant execute on function public.delete_share_comment(uuid) to authenticated;
