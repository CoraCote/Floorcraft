import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useProjectStore } from '../../../stores/projectStore'
import type { ShareComment } from '../../../lib/shareComments'

/**
 * Editor-side companion to the share-mode comments. Authenticated
 * owners / editors / team admins of an office see every comment left
 * via any of the office's share links — typed reviewer feedback that
 * never required the reviewer to sign up.
 *
 * Reads the `share_comments` table directly. The
 * `share_comments_owner_read` RLS policy from migration 0014 gates
 * SELECT access; non-permitted callers get an empty result, which
 * the panel renders as the empty state. (No need for an RPC layer
 * here — the bearer-token model only matters for the anonymous write
 * path.)
 *
 * State convention: `comments === null` means "loading" (or
 * pre-officeId), `[]` means "loaded, empty", `[...]` means "loaded".
 * Three-state instead of a separate `isLoading` boolean to avoid
 * the React 19 set-state-in-effect rule firing on intermediate state
 * resets.
 */
export function OfficeCommentsPanel() {
  const officeId = useProjectStore((s) => s.officeId)
  const [comments, setComments] = useState<ShareComment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  if (comments === null) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">Loading comments…</p>
    )
  }
  if (error) {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">
        Couldn&rsquo;t load comments: {error}
      </p>
    )
  }
  if (comments.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-2">
        <MessageSquare size={12} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
        <p>
          No comments yet. Share a view-only link from the File menu — recipients
          can leave feedback without signing up.
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {comments.map((c) => (
        <li
          key={c.id}
          className="rounded border border-[color:var(--color-paper-line)] dark:border-gray-800 p-2"
        >
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
              {c.author_name?.trim() || 'Anonymous'}
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
      ))}
    </ul>
  )
}
