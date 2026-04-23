-- 0010_rbac_and_audit.sql
-- Phase 5: widen office_permissions roles; add audit_events table + RLS.

-- 1. Widen the office_permissions role constraint additively so legacy
--    rows keep working. New roles slot in next to existing ones.
alter table office_permissions
  drop constraint if exists office_permissions_role_check;
alter table office_permissions
  add constraint office_permissions_role_check
  check (role in ('owner','editor','hr-editor','space-planner','viewer'));

-- 2. audit_events table. Scoped to a team (workspace) so RLS can reuse
--    the same team-membership check other tables use. `metadata` is
--    jsonb for flexibility without schema churn.
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_team_idx on audit_events(team_id, created_at desc);
create index audit_events_actor_idx on audit_events(actor_id);

-- 3. RLS: a team member can see their team's events; only their own
--    inserts are allowed (prevents spoofing). Events are immutable —
--    no UPDATE/DELETE policies are granted.
alter table audit_events enable row level security;

create policy "audit_events_team_select"
  on audit_events for select
  using (
    exists (
      select 1 from team_members tm
      where tm.team_id = audit_events.team_id
        and tm.user_id = auth.uid()
    )
  );

create policy "audit_events_self_insert"
  on audit_events for insert
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from team_members tm
      where tm.team_id = audit_events.team_id
        and tm.user_id = auth.uid()
    )
  );
