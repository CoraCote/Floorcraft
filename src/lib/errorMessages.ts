/**
 * Centralised translator for Supabase / Postgres errors into text a
 * non-technical user can act on. The reviewer pointed out that we were
 * surfacing `error.message` verbatim in several places — which means the
 * end-user sometimes sees literal strings like
 *
 *   "duplicate key value violates unique constraint
 *    \"team_members_team_user_idx\""
 *
 * or raw `raise exception 'invite_email_mismatch'` payloads. None of
 * those are meaningful outside this codebase.
 *
 * This module maps the well-known error codes / substrings we produce
 * to a human-readable sentence. Unknown errors fall through to the
 * original message so we never swallow information we don't recognise —
 * better an ugly message than a wrong one.
 */

interface SupabaseLikeError {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

const RAISE_EXCEPTION_MAP: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  no_auth_user: 'Your account is missing. Please sign in again.',
  invite_not_found:
    "This invite link doesn't exist. Ask your admin to send a new one.",
  invite_email_mismatch:
    'This invite was sent to a different email address. Please sign in with that email.',
  invite_already_used: 'This invite has already been accepted.',
  invite_expired: 'This invite has expired. Ask your admin to send a new one.',
  office_not_found: "This office doesn't exist anymore.",
  forbidden: "You don't have permission to do that.",
  team_name_required: 'Please provide a team name.',
  rate_limited: "You're doing that too quickly. Please wait a moment and try again.",
}

// Postgres SQLSTATE codes that surface often enough to be worth translating.
const PG_CODE_MAP: Record<string, string> = {
  '23505': 'That already exists.', // unique_violation
  '23503': 'That references something that no longer exists.', // foreign_key_violation
  '23502': 'A required field is missing.', // not_null_violation
  '23514': "That value isn't allowed.", // check_violation
  '42501': "You don't have permission to do that.", // insufficient_privilege
  PGRST301: "You don't have permission to do that.", // PostgREST RLS denial
  PGRST116: 'No matching record found.', // No rows returned from .single()
}

/**
 * Translate a Supabase / Postgres error into user-facing text. Pass the
 * caught value directly — we defensively handle strings, Error
 * instances, and raw PostgrestError-shaped objects.
 */
export function humanizeError(err: unknown): string {
  if (err == null) return 'Something went wrong.'
  if (typeof err === 'string') return translateMessage(err)

  const e = err as SupabaseLikeError
  if (e.code && PG_CODE_MAP[e.code]) return PG_CODE_MAP[e.code]
  if (e.message) return translateMessage(e.message)

  return 'Something went wrong.'
}

function translateMessage(raw: string): string {
  // `raise exception 'invite_not_found'` surfaces to the client as a
  // message like "invite_not_found" or with extra Postgres framing.
  // Match against the set of raise-exception tokens we use in migrations.
  for (const token of Object.keys(RAISE_EXCEPTION_MAP)) {
    if (raw.includes(token)) return RAISE_EXCEPTION_MAP[token]
  }

  // Common Supabase auth messages — minor cleanups so the user doesn't
  // see terminology from a backend they shouldn't need to know about.
  const lower = raw.toLowerCase()
  if (
    lower.includes('row-level security policy') ||
    lower.includes('violates row-level security')
  ) {
    // RLS denial is almost always a session problem surfaced as a raw
    // Postgres string. "You don't have permission to do that. Try signing
    // out and back in." nudges the user to the common fix.
    return "You don't have permission to do that. Try signing out and back in."
  }
  if (lower.includes('invalid login credentials')) {
    return 'Email or password is incorrect.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Please click the verification link in your email before signing in.'
  }
  if (lower.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (lower.includes('email rate limit exceeded')) {
    return 'Too many emails sent to this address. Please wait a few minutes.'
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return "Can't reach the server. Check your connection and try again."
  }

  return raw
}
