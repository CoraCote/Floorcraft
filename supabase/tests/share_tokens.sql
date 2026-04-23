do $$
begin
  if not exists (select 1 from information_schema.tables where table_name = 'share_tokens') then
    raise exception 'share_tokens table missing';
  end if;
  if not (select relrowsecurity from pg_class where relname = 'share_tokens') then
    raise exception 'RLS not enabled on share_tokens';
  end if;
end $$;

\echo 'share_tokens.sql: checks passed.'
