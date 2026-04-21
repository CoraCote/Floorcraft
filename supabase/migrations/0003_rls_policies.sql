-- supabase/migrations/0003_rls_policies.sql

-- Enable RLS on every app table. Any table without a policy denies everything.
alter table profiles          enable row level security;
alter table teams             enable row level security;
alter table team_members      enable row level security;
alter table invites           enable row level security;
alter table offices           enable row level security;
alter table office_permissions enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_self_read on profiles
  for select using (id = auth.uid());

create policy profiles_teammate_read on profiles
  for select using (
    exists (
      select 1
        from team_members me
        join team_members them on them.team_id = me.team_id
       where me.user_id = auth.uid()
         and them.user_id = profiles.id
    )
  );

create policy profiles_self_update on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

-- teams ---------------------------------------------------------------------
create policy teams_member_read on teams
  for select using (is_team_member(id));

create policy teams_any_auth_insert on teams
  for insert with check (auth.uid() is not null and created_by = auth.uid());

create policy teams_admin_update on teams
  for update using (is_team_admin(id))
  with check (is_team_admin(id));

create policy teams_admin_delete on teams
  for delete using (is_team_admin(id));

-- team_members --------------------------------------------------------------
create policy team_members_read on team_members
  for select using (is_team_member(team_id));

create policy team_members_admin_insert on team_members
  for insert with check (is_team_admin(team_id));

create policy team_members_admin_update on team_members
  for update using (is_team_admin(team_id))
  with check (is_team_admin(team_id));

create policy team_members_admin_or_self_delete on team_members
  for delete using (is_team_admin(team_id) or user_id = auth.uid());

-- invites -------------------------------------------------------------------
create policy invites_admin_or_recipient_read on invites
  for select using (
    is_team_admin(team_id)
    or email = (select email from profiles where id = auth.uid())
  );

create policy invites_admin_insert on invites
  for insert with check (is_team_admin(team_id) and invited_by = auth.uid());

create policy invites_admin_delete on invites
  for delete using (is_team_admin(team_id));

-- Intentionally no client UPDATE policy — acceptance goes through
-- the accept_invite RPC in migration 0005.

-- offices -------------------------------------------------------------------
create policy offices_read on offices
  for select using (
    is_team_member(team_id)
    and (not is_private or has_office_perm(id))
  );

create policy offices_insert on offices
  for insert with check (
    is_team_member(team_id) and created_by = auth.uid()
  );

create policy offices_update on offices
  for update using (
    office_perm_role(id) in ('owner','editor')
    or (
      is_team_member(team_id)
      and not is_private
      and office_perm_role(id) is distinct from 'viewer'
    )
  )
  with check (
    office_perm_role(id) in ('owner','editor')
    or (
      is_team_member(team_id)
      and not is_private
      and office_perm_role(id) is distinct from 'viewer'
    )
  );

create policy offices_delete on offices
  for delete using (
    office_perm_role(id) = 'owner'
    or is_team_admin(team_id)
  );

-- office_permissions --------------------------------------------------------
create policy office_permissions_read on office_permissions
  for select using (
    is_team_member(
      (select team_id from offices where id = office_permissions.office_id)
    )
  );

create policy office_permissions_write on office_permissions
  for all using (
    office_perm_role(office_id) = 'owner'
    or is_team_admin((select team_id from offices where id = office_permissions.office_id))
  )
  with check (
    office_perm_role(office_id) = 'owner'
    or is_team_admin((select team_id from offices where id = office_permissions.office_id))
  );
