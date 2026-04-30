import { supabase } from './supabase'

export interface ShareComment {
  id: string
  office_id: string
  body: string
  author_name: string
  created_at: string
  /**
   * Bearer token the comment was authored under. Anonymous comments
   * left via `add_share_comment` carry the token; owner-side replies
   * left via `add_office_comment` (migration 0015) have `null` here.
   * The UI uses the null discriminant to render an "Owner reply"
   * badge and a different visual treatment.
   */
  share_token: string | null
}

/**
 * Add a comment to a shared office via the bearer share token. Calls
 * the SECURITY DEFINER `add_share_comment` RPC (migration 0014) which
 * gates on token validity + office pairing — no direct table access
 * for anon callers.
 *
 * Returns the inserted row on success (so the UI can append it to the
 * list without a refetch), or a `{kind: 'error'}` discriminant the
 * caller renders. Empty / overlong bodies are rejected server-side
 * (`comment_body_empty` / `comment_body_too_long`); the client also
 * pre-validates so the user gets a faster signal.
 */
export async function addShareComment(args: {
  token: string
  officeId: string
  body: string
  authorName: string
}): Promise<
  | { kind: 'ok'; comment: ShareComment }
  | { kind: 'error'; reason: 'empty' | 'too_long' | 'invalid_token' | 'unknown'; message: string }
> {
  const trimmed = args.body.trim()
  if (!trimmed) return { kind: 'error', reason: 'empty', message: 'Type something first.' }
  if (trimmed.length > 4000) {
    return {
      kind: 'error',
      reason: 'too_long',
      message: 'Comments are limited to 4000 characters.',
    }
  }

  const { data, error } = await supabase.rpc('add_share_comment', {
    p_token: args.token,
    p_office_id: args.officeId,
    p_body: trimmed,
    p_author_name: args.authorName,
  })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('invalid_or_revoked_token')) {
      return {
        kind: 'error',
        reason: 'invalid_token',
        message: 'This share link is no longer active.',
      }
    }
    if (msg.includes('comment_body_empty')) {
      return { kind: 'error', reason: 'empty', message: 'Type something first.' }
    }
    if (msg.includes('comment_body_too_long')) {
      return {
        kind: 'error',
        reason: 'too_long',
        message: 'Comments are limited to 4000 characters.',
      }
    }
    return { kind: 'error', reason: 'unknown', message: msg || 'Something went wrong.' }
  }
  return { kind: 'ok', comment: data as ShareComment }
}

/**
 * Owner / editor / team-admin reply on share comments. Calls the
 * `add_office_comment` SECURITY DEFINER RPC (migration 0015) which
 * gates on `auth.uid()` + permission membership. The resulting row
 * has `share_token = null`, which the UI uses to render an "Owner
 * reply" badge.
 */
export async function addOfficeComment(args: {
  officeId: string
  body: string
  authorName: string
}): Promise<
  | { kind: 'ok'; comment: ShareComment }
  | {
      kind: 'error'
      reason: 'empty' | 'too_long' | 'forbidden' | 'not_authenticated' | 'unknown'
      message: string
    }
> {
  const trimmed = args.body.trim()
  if (!trimmed) return { kind: 'error', reason: 'empty', message: 'Type something first.' }
  if (trimmed.length > 4000) {
    return {
      kind: 'error',
      reason: 'too_long',
      message: 'Comments are limited to 4000 characters.',
    }
  }
  const { data, error } = await supabase.rpc('add_office_comment', {
    p_office_id: args.officeId,
    p_body: trimmed,
    p_author_name: args.authorName,
  })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_authenticated')) {
      return {
        kind: 'error',
        reason: 'not_authenticated',
        message: 'Sign in to leave a reply.',
      }
    }
    if (msg.includes('forbidden')) {
      return {
        kind: 'error',
        reason: 'forbidden',
        message: "You don't have permission to comment on this office.",
      }
    }
    if (msg.includes('comment_body_empty')) {
      return { kind: 'error', reason: 'empty', message: 'Type something first.' }
    }
    if (msg.includes('comment_body_too_long')) {
      return {
        kind: 'error',
        reason: 'too_long',
        message: 'Comments are limited to 4000 characters.',
      }
    }
    return { kind: 'error', reason: 'unknown', message: msg || 'Something went wrong.' }
  }
  return { kind: 'ok', comment: data as ShareComment }
}

/**
 * Owner-side delete on a share comment. Calls the
 * `delete_share_comment` SECURITY DEFINER RPC (migration 0016) which
 * gates on `auth.uid()` + permission membership. Returns a
 * discriminated union the caller can render — distinguishes
 * "already gone" from "not allowed" so the UI can keep the row in
 * place vs prompt re-auth.
 */
export async function deleteShareComment(
  commentId: string,
): Promise<
  | { kind: 'ok' }
  | {
      kind: 'error'
      reason: 'not_found' | 'forbidden' | 'not_authenticated' | 'unknown'
      message: string
    }
> {
  const { error } = await supabase.rpc('delete_share_comment', {
    p_comment_id: commentId,
  })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('not_found')) {
      return { kind: 'error', reason: 'not_found', message: 'Already deleted.' }
    }
    if (msg.includes('forbidden')) {
      return {
        kind: 'error',
        reason: 'forbidden',
        message: "You don't have permission to delete this comment.",
      }
    }
    if (msg.includes('not_authenticated')) {
      return {
        kind: 'error',
        reason: 'not_authenticated',
        message: 'Sign in to delete comments.',
      }
    }
    return { kind: 'error', reason: 'unknown', message: msg || 'Something went wrong.' }
  }
  return { kind: 'ok' }
}

/**
 * List comments for a shared office via the bearer share token. Sorted
 * newest-first by the RPC; the caller can re-sort if it cares. Returns
 * `null` on an RPC error (typically a stale / revoked link) so the
 * caller can decide whether to retry or surface a "couldn't load
 * comments" message — distinct from "no comments yet" which is `[]`.
 */
export async function listShareComments(args: {
  token: string
  officeId: string
}): Promise<ShareComment[] | null> {
  const { data, error } = await supabase.rpc('list_share_comments', {
    p_token: args.token,
    p_office_id: args.officeId,
  })
  if (error) {
    console.warn('[shareComments] list failed', error)
    return null
  }
  return (data ?? []) as ShareComment[]
}
