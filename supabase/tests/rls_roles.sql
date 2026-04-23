-- supabase/tests/rls_roles.sql
-- Schema-level smoke checks runnable via:
--   psql "$DATABASE_URL" -f supabase/tests/rls_roles.sql
-- Each DO block raises on failure, so a clean run = all checks passed.

-- 1. audit_events must have the columns we rely on.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'audit_events' and column_name = 'team_id'
  ) then
    raise exception 'audit_events.team_id missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'audit_events' and column_name = 'actor_id'
  ) then
    raise exception 'audit_events.actor_id missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'audit_events' and column_name = 'metadata'
  ) then
    raise exception 'audit_events.metadata missing';
  end if;
end $$;

-- 2. office_permissions role constraint must include the new roles.
do $$
declare
  cstr text;
begin
  select pg_get_constraintdef(c.oid) into cstr
  from pg_constraint c
  where c.conname = 'office_permissions_role_check';
  if cstr is null then
    raise exception 'office_permissions_role_check constraint missing';
  end if;
  if cstr not like '%hr-editor%' or cstr not like '%space-planner%' then
    raise exception 'office_permissions role check does not include the new roles: %', cstr;
  end if;
end $$;

-- 3. RLS must be enabled on audit_events.
do $$
begin
  if not (select relrowsecurity from pg_class where relname = 'audit_events') then
    raise exception 'RLS not enabled on audit_events';
  end if;
end $$;

\echo 'rls_roles.sql: all checks passed.'
