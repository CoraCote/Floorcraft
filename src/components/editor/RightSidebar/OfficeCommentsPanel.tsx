import { useEffect, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useProjectStore } from '../../../stores/projectStore'
import { useSession } from '../../../lib/auth/AuthProvider'
import {
  addOfficeComment,
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

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!officeId) {
        setComments([])
        return
      }
      const { data, error: err } = await supabase
        .from('share_comments')
        .select('*')
        .eq('office_id', officeId)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (err) {
        setError(err.message)
        setComments([])
        return
      }
      setError(null)
      setComments((data ?? []) as ShareComment[])
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [officeId])

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
            return (
              <li
                key={c.id}
                className={`rounded border p-2 ${
                  isOwnerReply
                    ? 'border-[color:var(--color-blueprint)]/40 bg-[color:var(--color-blueprint-soft)]/30'
                    : 'border-[color:var(--color-paper-line)] dark:border-gray-800'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                      {c.author_name?.trim() || 'Anonymous'}
                    </span>
                    {isOwnerReply && (
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] px-1 py-0.5 rounded bg-[color:var(--color-blueprint-soft)] dark:bg-gray-800">
                        Owner
                      </span>
                    )}
                  </span>
                  <time
                    dateTime={c.created_at}
                    className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0"
                  >
                    {new Date(c.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
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
