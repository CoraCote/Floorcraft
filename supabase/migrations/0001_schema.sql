-- supabase/migrations/0001_schema.sql

create extension if not exists "pgcrypto";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  active_team_id uuid,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

alter table profiles
  add constraint profiles_active_team_fk
  foreign key (active_team_id) references teams(id) on delete set null;

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid(),
  invited_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

create unique index invites_one_pending_per_email
  on invites (team_id, email) where accepted_at is null;

create table offices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  slug text not null,
  name text not null,
  created_by uuid not null references profiles(id),
  is_private boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, slug)
);

create table office_permissions (
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (office_id, user_id)
);

create index offices_team_idx on offices(team_id);
create index team_members_user_idx on team_members(user_id);
create index invites_token_idx on invites(token);
