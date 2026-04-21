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

rollback;
