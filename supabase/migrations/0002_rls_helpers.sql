-- supabase/migrations/0002_rls_helpers.sql

create or replace function is_team_member(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members
     where team_id = tid and user_id = auth.uid()
  )
$$;

create or replace function is_team_admin(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members
     where team_id = tid
       and user_id = auth.uid()
       and role = 'admin'
  )
$$;

create or replace function office_perm_role(oid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from office_permissions
   where office_id = oid and user_id = auth.uid()
$$;

create or replace function has_office_perm(oid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from office_permissions
     where office_id = oid and user_id = auth.uid()
  )
$$;
