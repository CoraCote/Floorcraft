/**
 * Turn a Supabase auth error (or any thrown error) into a human-readable
 * message suitable for display next to a form.
 *
 * Supabase surfaces two broad classes of failure:
 *
 *   1. Server responses — e.g. `{ message: "Invalid login credentials" }`
 *      from `signInWithPassword` when the password is wrong. These
 *      strings are already user-facing and should be passed through.
 *
 *   2. Network / runtime errors — e.g. `TypeError: Failed to fetch` when
 *      the browser can't reach the Supabase endpoint at all. That string
 *      is the raw `fetch` exception and leaks implementation detail; we
 *      replace it with a friendlier, actionable message.
 *
 * We keep the known-good Supabase strings instead of trying to localise
 * or rewrite them, so bug reports still quote the server's actual reason
 * and we don't accidentally obscure auth diagnostics.
 */

const NETWORK_ERROR_FRAGMENTS = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'load failed',
]

/**
 * Substrings Supabase Auth uses when a sign-in / refresh fails because
 * `auth.users.banned_until` is in the future. The message has varied
 * across GoTrue versions ("User is banned", "user_banned", "user is
 * banned until …"), so we match on a few overlapping fragments.
 *
 * Used by both `humanizeAuthError` and `isSuspendedAuthError` — the
 * login flow checks for it to redirect to /suspended instead of
 * showing the raw banned-until timestamp inline.
 */
const SUSPENDED_FRAGMENTS = ['user is banned', 'user_banned', 'banned until']

export function isSuspendedAuthError(err: unknown): boolean {
  const raw =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message ?? '')
      : String(err ?? '')
  const lower = raw.toLowerCase()
  return SUSPENDED_FRAGMENTS.some((f) => lower.includes(f))
}

export function humanizeAuthError(err: unknown): string {
  const raw =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message ?? '')
      : String(err ?? '')

  const lower = raw.toLowerCase().trim()

  if (!lower) {
    return "Something went wrong. Please try again."
  }

  if (NETWORK_ERROR_FRAGMENTS.some((f) => lower.includes(f))) {
    return "Can't reach the server. Check your connection and try again."
  }

  return raw
}
