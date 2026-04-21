-- supabase/migrations/0005_accept_invite_rpc.sql

create or replace function accept_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_record invites%rowtype;
  caller_email text;
begin
  -- Caller must be signed in.
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select email into caller_email from profiles where id = auth.uid();
  if caller_email is null then
    raise exception 'no_profile';
  end if;

  -- Fetch and validate the invite.
  select * into invite_record from invites where token = invite_token;

  if invite_record is null then
    raise exception 'invite_not_found';
  end if;

  if invite_record.accepted_at is not null then
    raise exception 'invite_already_used';
  end if;

  if invite_record.expires_at < now() then
    raise exception 'invite_expired';
  end if;

  if lower(invite_record.email) <> lower(caller_email) then
    raise exception 'invite_email_mismatch';
  end if;

  -- Atomically add membership + mark invite used.
  insert into team_members (team_id, user_id, role)
  values (invite_record.team_id, auth.uid(), 'member')
  on conflict do nothing;

  update invites set accepted_at = now() where id = invite_record.id;

  return invite_record.team_id;
end;
$$;

grant execute on function accept_invite(uuid) to authenticated;
