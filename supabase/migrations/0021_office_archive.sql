-- 0021_office_archive.sql
--
-- Soft-delete for offices. The existing "Delete office" path is hard
-- and destructive — payload, share-tokens, employees all gone, and
-- you cannot undo it. Many operators want a middle ground: hide an
-- office from the team-home dashboard without losing the historical
-- data. That's archive.
--
-- Mechanic:
--   - `archived_at timestamptz`: null = active, non-null = archived.
--   - `listOffices` filters out archived by default; team-home gets a
--     "Show archived (N)" toggle to surface them.
--   - Archived offices are read-only at the application layer (the
--     UI hides edit affordances). For a hard server-side block,
--     unarchive first or hard-delete via the existing path.
--
-- Distinct from team suspension (#0019):
--   - Suspend is platform-admin-driven, applies to a whole team,
--     blocks WRITES at the database via trigger.
--   - Archive is team-owner-driven, applies to one office, hides it
--     in the UI but doesn't block writes server-side. The cost-of-
--     enforcement vs. cost-of-misuse tradeoff favors UI-only here.

alter table offices
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references profiles(id);

create index if not exists offices_archived_idx
  on offices(team_id, archived_at) where archived_at is null;

-- Owners + editors can archive / unarchive. We expose this as RPCs
-- (not raw UPDATE policies) so we can record `archived_by` in one
-- shot rather than asking the client to compute it.
create or replace function public.archive_office(p_office_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(office_perm_role(p_office_id), '') into caller_role;
  if caller_role not in ('owner', 'editor') and not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;

  update offices
    set archived_at = clock_timestamp(),
        archived_by = auth.uid()
    where id = p_office_id;
end;
$$;

revoke all on function public.archive_office(uuid) from public;
grant execute on function public.archive_office(uuid) to authenticated;

create or replace function public.unarchive_office(p_office_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select coalesce(office_perm_role(p_office_id), '') into caller_role;
  if caller_role not in ('owner', 'editor') and not is_current_user_platform_admin() then
    raise exception 'forbidden';
  end if;
  update offices
    set archived_at = null,
        archived_by = null
    where id = p_office_id;
end;
$$;

revoke all on function public.unarchive_office(uuid) from public;
grant execute on function public.unarchive_office(uuid) to authenticated;
