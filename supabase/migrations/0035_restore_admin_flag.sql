-- 0035_restore_admin_flag.sql
--
-- One-shot data fix. The platform-admin flag for the operator running
-- the migrations got flipped to false at some point during the launch-
-- wave testing (most likely a bulk-revoke that didn't have self-
-- protection — the code-side guard lands in the same PR as this).
-- Symptom on the dashboard: every /admin/* RPC bounced with a
-- "forbidden" exception, surfaced as "Could not load …" in the UI,
-- because is_current_user_platform_admin() returned false.
--
-- Idempotent: does nothing if the flag is already true. Safe to leave
-- in the migration history — re-running it on a project where the
-- account already has the flag is a no-op.
--
-- Scoped to a specific email so this isn't a "make everyone admin"
-- foot-gun if someone accidentally re-applies on a different project.

update profiles
  set is_platform_admin = true
  where email = 'ext-robert.casto@aircall.io'
    and is_platform_admin = false;
