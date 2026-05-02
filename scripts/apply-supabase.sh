#!/usr/bin/env bash
# apply-supabase.sh
#
# One-shot deploy: pushes any new migrations and re-deploys all of
# the Edge Functions Floorcraft expects to exist.
#
# Idempotent — re-run safely after each migration- or function-
# touching merge. Skips work that's already in sync.
#
# Prereqs (already set up on the maintainer's machine — no action
# needed for everyday runs):
#   - `npx supabase` resolves (it does via the dev dependency)
#   - the project is linked: `supabase/.temp/project-ref` exists
#     and points at the production project. If you've never linked,
#     run `npx supabase link --project-ref <ref>` once.
#
# Usage:
#   ./scripts/apply-supabase.sh                # migrations + all functions
#   ./scripts/apply-supabase.sh --migrations   # migrations only
#   ./scripts/apply-supabase.sh --functions    # functions only
#
# After it finishes, the remote should match what's on this branch.

set -euo pipefail

cd "$(dirname "$0")/.."

# Edge Functions that the platform-admin surface (and the team-
# invite flow) rely on. Add new ones here when they ship.
FUNCTIONS=(
  "send-invite-email"
  "admin-send-password-reset"
  "admin-set-user-suspension"
)

mode="${1:-all}"
case "$mode" in
  --migrations) push_migrations=1; deploy_functions=0 ;;
  --functions)  push_migrations=0; deploy_functions=1 ;;
  all|"")       push_migrations=1; deploy_functions=1 ;;
  *)
    echo "Usage: $0 [--migrations|--functions]" >&2
    exit 2
    ;;
esac

if [ "$push_migrations" -eq 1 ]; then
  echo "==> Pushing migrations to remote…"
  # --include-all so a "newer migration on remote, missing one in
  # the middle locally" state still applies cleanly. Without it the
  # CLI bails with "Found local migration files to be inserted before
  # the last migration on remote" — common when rebasing a branch
  # whose number was assigned before a sibling PR landed.
  npx supabase db push --linked --include-all
  echo
fi

if [ "$deploy_functions" -eq 1 ]; then
  echo "==> Deploying Edge Functions…"
  # Function deploy hits the Supabase management API (not the
  # database), so it needs a personal access token. The CLI looks
  # at SUPABASE_ACCESS_TOKEN first, then ~/.supabase/access-token
  # written by `supabase login`.
  if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && [ ! -f "$HOME/.supabase/access-token" ]; then
    cat >&2 <<'EOF'
ERROR: no Supabase access token found.

Edge Function deploy needs a personal access token. One-time setup:

  npx supabase login          # browser-based, writes ~/.supabase/access-token

Or pass it inline:

  SUPABASE_ACCESS_TOKEN=sbp_xxx ./scripts/apply-supabase.sh --functions

(Database migrations work without this — the CLI uses the cached
pooler creds from `supabase link`.)
EOF
    exit 1
  fi
  for fn in "${FUNCTIONS[@]}"; do
    if [ ! -d "supabase/functions/$fn" ]; then
      echo "  · $fn — directory missing, skipping" >&2
      continue
    fi
    echo "  · $fn"
    npx supabase functions deploy "$fn"
  done
  echo
fi

echo "Done."
