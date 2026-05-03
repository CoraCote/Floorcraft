-- 0034_offices_last_edited_by.sql
--
-- Track who last edited an office. The `updated_at` column tells you
-- "when" but not "who" — the team-home OfficeCard currently shows
-- bare "updated 3h ago" which doesn't help when "we always reference
-- HQ but rarely click into it" needs an attribution.
--
-- Adds a nullable `last_edited_by` column + trigger that stamps it
-- alongside the existing `updated_at` bump. ON DELETE SET NULL so
-- removing a profile doesn't cascade-delete every office they
-- touched.
--
-- The trigger runs as a BEFORE UPDATE on payload, so:
--   - Plain UPDATEs from the client (saveOffice's optimistic lock
--     path) get attribution automatically — no client change needed.
--   - The save_office_force RPC's UPDATE inside its transaction also
--     picks up auth.uid() because the RPC's caller-scoped session
--     still has it set.
--   - Server-side maintenance updates (which set `payload` to
--     null/auth.uid() not present) safely fall through — the trigger
--     leaves last_edited_by untouched if auth.uid() is null.

alter table offices
  add column if not exists last_edited_by uuid references profiles(id) on delete set null;

create or replace function bump_last_edited_by()
returns trigger
language plpgsql
as $$
begin
  -- Only stamp when an authenticated session is doing the update.
  -- Background jobs / SECURITY DEFINER admin RPCs running without
  -- an end-user session leave the existing value alone.
  if auth.uid() is not null then
    new.last_edited_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists offices_bump_last_edited_by on offices;
create trigger offices_bump_last_edited_by
  before update of payload on offices
  for each row
  execute function bump_last_edited_by();
