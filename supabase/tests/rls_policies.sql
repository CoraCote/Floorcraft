-- supabase/tests/rls_policies.sql
-- Runs against a fresh local DB (`supabase db reset`) then `supabase test db`.

begin;

-- Fixture users — two teams, three users total.
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values
  ('11111111-1111-1111-1111-111111111111','alice@a.test','x',now()),
  ('22222222-2222-2222-2222-222222222222','bob@a.test','x',now()),
  ('33333333-3333-3333-3333-333333333333','eve@b.test','x',now());

-- Triggers created profiles via handle_new_user.

-- Alice creates Team A.
set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into teams (id, slug, name, created_by)
  values ('aaaa1111-1111-1111-1111-111111111111','acme','Acme','11111111-1111-1111-1111-111111111111');

-- Eve creates Team B.
set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
insert into teams (id, slug, name, created_by)
  values ('bbbb2222-2222-2222-2222-222222222222','beta','Beta','33333333-3333-3333-3333-333333333333');

-- Alice invites Bob into Team A, Bob accepts.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into invites (team_id, email, invited_by)
values ('aaaa1111-1111-1111-1111-111111111111','bob@a.test','11111111-1111-1111-1111-111111111111');

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select accept_invite((select token from invites where email = 'bob@a.test'));

-- Alice creates an office (is_private=false by default).
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into offices (team_id, slug, name, created_by, payload)
values ('aaaa1111-1111-1111-1111-111111111111','hq','HQ','11111111-1111-1111-1111-111111111111','{}');

-- TEST 1: Eve (Team B) can NOT see Team A's office.
set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
do $$ begin
  if (select count(*) from offices where slug='hq') > 0 then
    raise exception 'LEAK: Eve saw Team A office';
  end if;
end $$;

-- TEST 2: Bob (Team A member, no explicit perm) CAN see the office (default editor).
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from offices where slug='hq') = 0 then
    raise exception 'MISSING: Bob should see Team A office';
  end if;
end $$;

-- TEST 3: Bob can UPDATE the office (default editor).
update offices set payload='{"v":1}'::jsonb where slug='hq';
do $$ begin
  if (select payload->>'v' from offices where slug='hq') <> '1' then
    raise exception 'UPDATE: Bob''s update did not land';
  end if;
end $$;

-- TEST 4: Alice (owner) sets Bob's perm to viewer; Bob can no longer UPDATE.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into office_permissions (office_id, user_id, role)
values ((select id from offices where slug='hq'), '22222222-2222-2222-2222-222222222222', 'viewer');

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$
declare
  rows_updated int;
begin
  update offices set payload='{"v":2}'::jsonb where slug='hq';
  get diagnostics rows_updated = row_count;
  if rows_updated > 0 then
    raise exception 'VIEWER: Bob updated as viewer (should be denied)';
  end if;
end $$;

-- TEST 5: Private office hides from default team members.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
update offices set is_private = true where slug='hq';

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
-- Bob has an explicit viewer row from TEST 4, so he still sees it.
do $$ begin
  if (select count(*) from offices where slug='hq') = 0 then
    raise exception 'PRIVATE: Bob (viewer) should still see private office';
  end if;
end $$;

-- Cleanup test for someone with no perm.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
delete from office_permissions
 where office_id = (select id from offices where slug='hq')
   and user_id = '22222222-2222-2222-2222-222222222222';

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from offices where slug='hq') > 0 then
    raise exception 'PRIVATE-NO-PERM: Bob (no perm) should not see private office';
  end if;
end $$;

-- -------------------------------------------------------------------
-- 0006 regression tests — P0 security fixes from the senior-dev review.
-- -------------------------------------------------------------------

-- TEST 6: Invite emails are normalized to lowercase at insert time
-- (#1). Even if a caller submits mixed case the row stores lower(),
-- keeping the unique index consistent with the case-insensitive
-- compare in accept_invite.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into invites (team_id, email, invited_by)
values ('aaaa1111-1111-1111-1111-111111111111','Carol@A.TEST','11111111-1111-1111-1111-111111111111');
do $$ begin
  if (select count(*) from invites where email = 'carol@a.test') <> 1 then
    raise exception 'NORMALIZE: mixed-case insert did not normalize to lowercase';
  end if;
end $$;
-- Clean up so it doesn't interfere with subsequent tests.
delete from invites where email = 'carol@a.test';

-- TEST 7: invites SELECT no longer leaks to the recipient (#3).
-- Alice invites Eve (Team B user) into Team A. Eve must NOT be able
-- to read that row directly — she only gets in via accept_invite.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into invites (team_id, email, invited_by)
values ('aaaa1111-1111-1111-1111-111111111111','eve@b.test','11111111-1111-1111-1111-111111111111');

set local "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
do $$ begin
  if (select count(*) from invites where email = 'eve@b.test') > 0 then
    raise exception 'LEAK: Eve read an invite directly (recipient SELECT should be gone)';
  end if;
end $$;

-- TEST 8: accept_invite honors the invite.role column (#4). Alice
-- creates a second team and invites Bob in as admin. After accept,
-- Bob must show up as admin in team_members.
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into teams (id, slug, name, created_by)
  values ('cccc3333-3333-3333-3333-333333333333','gamma','Gamma','11111111-1111-1111-1111-111111111111');

insert into invites (team_id, email, invited_by, role)
values ('cccc3333-3333-3333-3333-333333333333','bob@a.test','11111111-1111-1111-1111-111111111111','admin');

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select accept_invite((select token from invites
                        where team_id='cccc3333-3333-3333-3333-333333333333'
                          and email='bob@a.test'));

do $$ begin
  if (select role from team_members
       where team_id='cccc3333-3333-3333-3333-333333333333'
         and user_id='22222222-2222-2222-2222-222222222222') <> 'admin' then
    raise exception 'ROLE: Bob should have joined Gamma as admin';
  end if;
end $$;

-- TEST 9: accept_invite reads caller identity from auth.users, not
-- profiles (#2). Simulate the case where profiles.email has drifted
-- from the authoritative auth.users.email (as happens after an email
-- change via auth.updateUser). The RPC must still succeed because it
-- resolves caller_email from auth.users.
--
-- Create a fresh user whose profiles row is intentionally desynced.
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values ('44444444-4444-4444-4444-444444444444','dave-new@a.test','x',now());

-- Manually rewrite the profiles row to the OLD email. This is what
-- the pre-0006 code left behind after auth.updateUser.
update profiles set email='dave-old@a.test' where id='44444444-4444-4444-4444-444444444444';

set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into invites (team_id, email, invited_by)
values ('aaaa1111-1111-1111-1111-111111111111','dave-new@a.test','11111111-1111-1111-1111-111111111111');

set local "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
select accept_invite((select token from invites
                        where team_id='aaaa1111-1111-1111-1111-111111111111'
                          and email='dave-new@a.test'));

do $$ begin
  if (select count(*) from team_members
       where team_id='aaaa1111-1111-1111-1111-111111111111'
         and user_id='44444444-4444-4444-4444-444444444444') <> 1 then
    raise exception 'AUTH-USERS: accept_invite should match on auth.users.email';
  end if;
end $$;

-- TEST 10: profiles.email stays in sync when auth.users.email changes
-- (#2, the forward direction). After the trigger fires, a fresh read
-- from profiles must reflect the new email.
set local role postgres;
update auth.users set email='dave-rotated@a.test' where id='44444444-4444-4444-4444-444444444444';
do $$ begin
  if (select email from profiles where id='44444444-4444-4444-4444-444444444444') <> 'dave-rotated@a.test' then
    raise exception 'SYNC: profiles.email should track auth.users.email';
  end if;
end $$;

-- TEST 11: handle_new_user is idempotent on conflict (#16). Simulate
-- the "profile row already exists" case and ensure inserting the
-- matching auth.users row does not raise.
set local role postgres;
insert into profiles (id, email, name)
values ('55555555-5555-5555-5555-555555555555','preexisting@a.test','Pre');
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values ('55555555-5555-5555-5555-555555555555','preexisting@a.test','x',now());
-- If we reach this point the trigger swallowed the conflict.

rollback;
