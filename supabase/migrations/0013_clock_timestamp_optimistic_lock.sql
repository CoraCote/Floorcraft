-- supabase/migrations/0013_clock_timestamp_optimistic_lock.sql
--
-- Optimistic-lock predicate hardening.
--
-- `bump_updated_at` (0004) and `save_office_force` (0008) both used
-- `now()` to write the new `updated_at`. `now()` is a synonym for
-- `transaction_timestamp()` — it is fixed for the *entire transaction*,
-- so two updates inside one transaction get IDENTICAL timestamps, and
-- two transactions that happen to start in the same wall-clock instant
-- can also collide. Either case can produce two `updated_at` values
-- that match a stale client-side `loadedVersion` and silently let a
-- second writer clobber the first without tripping the conflict check.
--
-- `clock_timestamp()` returns the actual wall-clock instant the call
-- runs, so per-row updates inside a transaction (and any pair of
-- competing transactions) get strictly distinct timestamps modulo
-- microsecond resolution. Same column, same type — no client change.

create or replace function bump_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create or replace function save_office_force(
  p_office_id uuid,
  p_payload jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  prior offices%rowtype;
  new_updated timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into prior from offices where id = p_office_id for update;
  if prior is null then
    raise exception 'office_not_found';
  end if;

  if not (
    is_team_admin(prior.team_id) or
    office_perm_role(p_office_id) in ('owner', 'editor')
  ) then
    raise exception 'forbidden';
  end if;

  insert into offices_history (
    office_id, prior_payload, prior_updated_at, overwritten_by
  ) values (
    p_office_id, prior.payload, prior.updated_at, auth.uid()
  );

  update offices
    set payload = p_payload,
        updated_at = clock_timestamp()
    where id = p_office_id
  returning updated_at into new_updated;

  return new_updated;
end;
$$;

revoke all on function save_office_force(uuid, jsonb) from public;
grant execute on function save_office_force(uuid, jsonb) to authenticated;
