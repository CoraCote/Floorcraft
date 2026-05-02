#!/usr/bin/env bash
# build-catchup.sh
#
# Regenerates scripts/catchup-admin-rpcs.sql from supabase/migrations/*.sql
# so the catchup file always covers every admin-side migration in one
# pasteable artifact. Idempotent end-to-end (every migration uses
# `create or replace`, `add column if not exists`, etc.) so re-running
# the resulting SQL is safe.
#
# Usage:
#   ./scripts/build-catchup.sh
#
# Conventions:
#   - Migrations 0017-* (platform admin role + overview) live in
#     bootstrap-platform-admin.sql, not the catchup. The catchup picks
#     up at 0018 onwards.
#   - Each migration file starts with `-- NNNN_name.sql` and a comment
#     block; the build copies the file verbatim (SQL comments are
#     inert) under a "============ NNNN: …" section divider.
#   - Run this script after adding any new migration that the admin
#     surface depends on, and commit the resulting catchup file. CI
#     doesn't yet auto-rebuild it.

set -euo pipefail

cd "$(dirname "$0")/.."

OUT="scripts/catchup-admin-rpcs.sql"
MIGRATIONS_DIR="supabase/migrations"

# Migrations to bundle, in order. We list them explicitly rather than
# globbing so the order is obvious + a typo gets caught at review.
BUNDLE=(
  "0018_admin_team_user_lists.sql"
  "0019_team_suspension.sql"
  "0020_billing.sql"
  "0021_office_archive.sql"
  "0022_admin_launch_wave.sql"
  "0023_admin_teams_listings.sql"
  "0024_admin_team_offices.sql"
  "0025_admin_user_detail.sql"
  "0026_admin_signups_histogram.sql"
  "0027_admin_team_activity_histogram.sql"
  "0028_user_suspension.sql"
  "0029_admin_user_audit.sql"
  "0030_admin_list_users_suspension.sql"
  "0031_admin_list_users_last_sign_in.sql"
  "0032_admin_audit_emissions.sql"
)

# Verify every bundled migration exists before touching the output —
# fail loudly rather than write a half-built file.
for f in "${BUNDLE[@]}"; do
  if [ ! -f "$MIGRATIONS_DIR/$f" ]; then
    echo "ERROR: missing migration $MIGRATIONS_DIR/$f" >&2
    exit 1
  fi
done

cat > "$OUT" <<'HEADER'
-- catchup-admin-rpcs.sql
--
-- The single file to paste into Supabase to bring a project up to
-- date with every admin-side migration. Idempotent end-to-end —
-- safe to re-paste after each release.
--
-- HOW TO USE
-- ----------
--   1. Open your Supabase project → SQL Editor → New query.
--   2. Paste this entire file → Run.
--   3. Sign in to the app → /admin → every page works.
--
-- Re-run any time after a release that adds a migration: this file
-- is updated in lock-step (regenerate via `./scripts/build-catchup.sh`),
-- so paste-and-go gets you current.
--
-- AUTO-GENERATED. Do not edit by hand — edit the source migration in
-- supabase/migrations/ and re-run scripts/build-catchup.sh.
HEADER

for f in "${BUNDLE[@]}"; do
  # Pull the migration number + brief subject from the filename so
  # the section divider is informative.
  num=$(echo "$f" | grep -oE '^[0-9]+')
  subject=$(echo "$f" | sed -E 's/^[0-9]+_//; s/\.sql$//; s/_/ /g')
  cat >> "$OUT" <<DIVIDER

-- ============================================================
-- ${num}: ${subject}
-- ============================================================
DIVIDER
  cat "$MIGRATIONS_DIR/$f" >> "$OUT"
done

echo "Wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines, ${#BUNDLE[@]} migrations bundled)"
