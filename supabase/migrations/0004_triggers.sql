-- supabase/migrations/0004_triggers.sql

-- Auto-provision a profile row whenever a new auth.users row is created.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- When a team is created, auto-add creator as admin.
create or replace function handle_new_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_members (team_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger on_team_created
after insert on teams
for each row execute function handle_new_team();

-- When an office is created, auto-write the creator as owner in office_permissions.
create or replace function handle_new_office()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.office_permissions (office_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_office_created
after insert on offices
for each row execute function handle_new_office();

-- Optimistic-concurrency source: bump updated_at on every UPDATE.
create or replace function bump_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger offices_bump_updated_at
before update on offices
for each row execute function bump_updated_at();
