-- supabase/migrations/0008_create_team_rpc.sql
--
-- Hotfix: team creation was failing on production with
--
--   new row violates row-level security policy for table "teams"
--
-- even for authenticated users whose session was known-good. The
-- `teams_any_auth_insert` policy requires `created_by = auth.uid()`;
-- under some circumstances the JWT `sub` claim visible to Postgres
-- doesn't match the `auth.uid()` the client believes is current
-- (verified email aud mismatch, Supabase project-level JWT rotation
-- race, edge-case where PostgREST sees a different claim than the
-- browser does), and the INSERT is rejected.
--
-- Rather than chase each of those edge cases in the policy, route team
-- creation through a SECURITY DEFINER RPC that:
--
--   1. Requires `auth.uid()` is not null (explicit 'not_authenticated'
--      error, not a generic RLS-violation string).
--   2. Inserts the team with `created_by = auth.uid()` — using the
--      server's view of the identity, which is always consistent with
--      the RLS helpers.
--   3. Inserts the creator as an admin in team_members *in the same
--      transaction*, so an observer can't see a team with no members.
--      This also means we can drop the reliance on the
--      handle_new_team AFTER INSERT trigger (the trigger still runs
--      for safety, but `on conflict do nothing` makes it a no-op when
--      the RPC already inserted).
--
-- Grant to `authenticated`. The anon role cannot call it — no
-- anonymous team creation.

create or replace function create_team(p_name text)
returns table (id uuid, slug text, name text, created_by uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  team_slug text;
  new_team_id uuid;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'team_name_required';
  end if;

  -- Mirror the client-side slug normalizer (lowercased, non-alphanum
  -- collapsed to '-'). Duplicates raise a unique-violation which the
  -- client already handles as a clear "team name taken" message.
  team_slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  team_slug := regexp_replace(team_slug, '^-+|-+$', '', 'g');
  if team_slug = '' then
    team_slug := 'team';
  end if;

  insert into teams (name, slug, created_by)
  values (trim(p_name), team_slug, caller)
  returning teams.id into new_team_id;

  -- Make the creator an admin. The handle_new_team AFTER INSERT
  -- trigger would also do this, but doing it explicitly means the RPC
  -- is self-contained and still works if someone ever drops the
  -- trigger. `on conflict do nothing` makes the trigger's own write
  -- harmless.
  insert into team_members (team_id, user_id, role)
  values (new_team_id, caller, 'admin')
  on conflict (team_id, user_id) do nothing;

  return query
  select t.id, t.slug, t.name, t.created_by, t.created_at
  from teams t
  where t.id = new_team_id;
end;
$$;

revoke all on function create_team(text) from public;
grant execute on function create_team(text) to authenticated;
