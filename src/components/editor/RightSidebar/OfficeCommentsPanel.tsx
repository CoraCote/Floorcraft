import { useEffect, useState } from 'react'
import { MessageSquare, RefreshCw, Send, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useProjectStore } from '../../../stores/projectStore'
import { useSession } from '../../../lib/auth/AuthProvider'
import { useToastStore } from '../../../stores/toastStore'
import {
  addOfficeComment,
  deleteShareComment,
  type ShareComment,
} from '../../../lib/shareComments'

/**
 * Editor-side companion to the share-mode comments. Authenticated
 * owners / editors / team admins of an office see every comment left
 * via any of the office's share links and can post owner-side
 * replies in the same thread.
 *
 * Reads `share_comments` directly via the
 * `share_comments_owner_read` RLS policy (migration 0014). Writes go
 * through the `add_office_comment` SECURITY DEFINER RPC (migration
 * 0015) which gates on auth.uid() + permission membership and
 * inserts with `share_token = null`. The UI uses the null
 * discriminant to render an "Owner" badge so anon reviewers'
 * comments and owner replies are visually distinguishable.
 *
 * State convention: `comments === null` means "loading"; `[]` is
 * "loaded, empty". Three-state to avoid the React 19
 * set-state-in-effect rule firing on intermediate resets.
 */
export function OfficeCommentsPanel() {
  const officeId = useProjectStore((s) => s.officeId)
  const session = useSession()
  const [comments, setComments] = useState<ShareComment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  // Tokens that the owner has revoked. Built alongside the comment
  // load so each comment can render a "via revoked link" badge when
  // its source token is no longer live — surfaces a "this feedback
  // came from a deprecated channel" signal that helps the owner
  // prioritize follow-up.
  const [revokedTokens, setRevokedTokens] = useState<Set<string>>(() => new Set())
  // Manual-refresh nonce. The user clicks the refresh button → we
  // bump this; the load effect's dep list includes it, so the
  // effect re-fires. Avoids extracting `load` to a callable while
  // staying in the named-async-function pattern that keeps the
  // React 19 set-state-in-effect rule happy.
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!officeId) {
        setComments([])
        setRevokedTokens(new Set())
        return
      }
      // Run the two queries in parallel — neither blocks the other.
      // share_tokens is the small one (one row per share link the
      // owner has ever created), so the count is bounded.
      const [commentsRes, tokensRes] = await Promise.all([
        supabase
          .from('share_comments')
          .select('*')
          .eq('office_id', officeId)
          .order('created_at', { ascending: false }),
        supabase
          .from('share_tokens')
          .select('token, revoked_at')
          .eq('office_id', officeId),
      ])
      if (cancelled) return
      setRefreshing(false)
      if (commentsRes.error) {
        setError(commentsRes.error.message)
        setComments([])
        return
      }
      setError(null)
      setComments((commentsRes.data ?? []) as ShareComment[])
      // Collect tokens whose revoked_at is non-null. The
      // share_tokens_owner_select policy from #179 gates this query;
      // a viewer would get an empty list and see no badges, which
      // is the right fail-mode (display-only signal).
      const revoked = new Set<string>()
      const tokenRows = (tokensRes.data ?? []) as Array<{ token: string; revoked_at: string | null }>
      for (const row of tokenRows) {
        if (row.revoked_at) revoked.add(row.token)
      }
      setRevokedTokens(revoked)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [officeId, refreshNonce])

  function onRefresh() {
    setRefreshing(true)
    setRefreshNonce((n) => n + 1)
  }

  async function onSubmitReply(e: React.FormEvent) {
    e.preventDefault()
    if (!officeId || posting) return
    setPosting(true)
    setPostError(null)
    const authorName =
      session.status === 'authenticated' ? session.user.email ?? '' : ''
    const result = await addOfficeComment({
      officeId,
      body: reply,
      authorName,
    })
    setPosting(false)
    if (result.kind === 'error') {
      setPostError(result.message)
      return
    }
    setComments((prev) => (prev ? [result.comment, ...prev] : [result.comment]))
    setReply('')
  }

  async function onDelete(commentId: string) {
    // Optimistic remove. If the RPC fails (forbidden / network), we
    // re-insert the row at its original index so the UI accurately
    // reflects server state.
    let removed: ShareComment | null = null
    let removedIdx = -1
    setComments((prev) => {
      if (!prev) return prev
      const idx = prev.findIndex((c) => c.id === commentId)
      if (idx < 0) return prev
      removed = prev[idx]
      removedIdx = idx
      const next = [...prev]
      next.splice(idx, 1)
      return next
    })
    const result = await deleteShareComment(commentId)
    if (result.kind === 'error' && result.reason !== 'not_found') {
      // Restore the row on real failure. `not_found` means the
      // server already considers it gone, so the optimistic remove
      // is correct.
      if (removed && removedIdx >= 0) {
        const r: ShareComment = removed
        const idx = removedIdx
        setComments((prev) => {
          if (!prev) return [r]
          const next = [...prev]
          next.splice(idx, 0, r)
          return next
        })
      }
      useToastStore.getState().push({
        tone: 'error',
        title: result.message,
      })
    }
  }

  if (comments === null) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">Loading comments…</p>
  }
  if (error) {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">
        Couldn&rsquo;t load comments: {error}
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {comments.length === 0
            ? 'No comments'
            : `${comments.length} comment${comments.length === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-0.5 rounded disabled:opacity-50"
          title="Refresh comments"
          aria-label="Refresh comments"
        >
          <RefreshCw
            size={11}
            aria-hidden="true"
            className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''}
          />
        </button>
      </div>
      {comments.length === 0 ? (
        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-2">
          <MessageSquare size={12} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
          <p>
            No comments yet. Share a view-only link from the File menu — recipients
            can leave feedback without signing up.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => {
            const isOwnerReply = c.share_token === null
            const viaRevokedLink =
              !isOwnerReply && c.share_token !== null && revokedTokens.has(c.share_token)
            return (
              <li
                key={c.id}
                className={`group relative rounded border p-2 ${
                  isOwnerReply
                    ? 'border-[color:var(--color-blueprint)]/40 bg-[color:var(--color-blueprint-soft)]/30'
                    : 'border-[color:var(--color-paper-line)] dark:border-gray-800'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                      {c.author_name?.trim() || 'Anonymous'}
                    </span>
                    {isOwnerReply && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] px-1 py-0.5 rounded bg-[color:var(--color-blueprint-soft)] dark:bg-gray-800">
                        Owner
                      </span>
                    )}
                    {viaRevokedLink && (
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40"
                        title="The share link this comment came in through has been revoked. New comments through that link won't arrive."
                      >
                        Revoked link
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <time
                      dateTime={c.created_at}
                      className="text-[10px] text-gray-500 dark:text-gray-400"
                    >
                      {new Date(c.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                    {/* Delete affordance — hover/focus-revealed so the
                        comment list stays calm when not being moderated.
                        Server gates on permission so a viewer who somehow
                        sees this won't actually delete; the UI just
                        avoids advertising the option. */}
                    <button
                      type="button"
                      onClick={() => onDelete(c.id)}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 p-0.5 rounded"
                      title="Delete comment"
                      aria-label={`Delete comment by ${c.author_name?.trim() || 'Anonymous'}`}
                    >
                      <Trash2 size={11} aria-hidden="true" />
                    </button>
                  </span>
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
                  {c.body}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {/* Owner-side reply form. Server gates on permission so a
          viewer who somehow lands here gets a "forbidden" error
          rather than silent failure. */}
      <form onSubmit={onSubmitReply} className="space-y-1.5 pt-1">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={4000}
          rows={2}
          placeholder="Reply as owner…"
          aria-label="Reply"
          disabled={posting}
          className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)] resize-y"
        />
        {postError && (
          <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
            {postError}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={posting || !reply.trim()}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-[color:var(--color-blueprint-strong)] text-white hover:bg-[color:var(--color-blueprint)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={11} aria-hidden="true" />
            {posting ? 'Posting…' : 'Post reply'}
          </button>
        </div>
      </form>
    </div>
  )
}
