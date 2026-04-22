-- supabase/migrations/0007_created_by_defaults.sql
alter table teams alter column created_by set default (auth.uid());
alter table offices alter column created_by set default (auth.uid());
