import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { resolveShareToken } from '../../lib/shareTokens'
import {
  addShareComment,
  listShareComments,
  type ShareComment,
} from '../../lib/shareComments'
import type { Employee } from '../../types/employee'

/**
 * Anonymous read-only surface for share-token URLs. The route is
 * `/shared/:projectId/:token` and is NOT behind the RequireAuth
 * wrapper — the SECURITY DEFINER `resolve_share_token` RPC
 * (migration 0012) does the gating on the server: it takes the
 * token as input and only ever returns the office row whose token
 * matches and is not revoked. Anon callers cannot enumerate.
 *
 * Pilot scope: roster-only table view + Brief 3 follow-up: anonymous
 * comments. The reviewer can leave a name + body without
 * authenticating; the SECURITY DEFINER `add_share_comment` /
 * `list_share_comments` RPCs (migration 0014) do the gating.
 */
export function SharedProjectView() {
  const { projectId, token } = useParams<{ projectId: string; token: string }>()
  const [status, setStatus] = useState<'loading' | 'invalid' | 'ready'>(
    projectId && token ? 'loading' : 'invalid',
  )
  const [employees, setEmployees] = useState<Employee[]>([])
  const [floorCount, setFloorCount] = useState(0)
  const [comments, setComments] = useState<ShareComment[]>([])
  const [commentsStatus, setCommentsStatus] = useState<
    'idle' | 'loading' | 'error'
  >('idle')

  useEffect(() => {
    if (!projectId || !token) return
    let cancelled = false
    ;(async () => {
      // Single round-trip: the RPC bundles the office payload so we
      // don't need a follow-up `loadOfficeById` (which previously
      // relied on the broad `offices_public_via_share_token` policy
      // that 0012 dropped).
      const resolved = await resolveShareToken(token)
      if (!resolved || resolved.officeId !== projectId) {
        if (!cancelled) setStatus('invalid')
        return
      }
      if (cancelled) return
      // Extract just the employee roster + floor count from the
      // payload. We deliberately don't hydrate the editor stores —
      // this surface has no editing capability and keeping it
      // isolated means an anon visitor can't poison the local store
      // state for an authenticated session in the same browser tab.
      const p = resolved.office.payload as {
        employees?: Record<string, Employee>
        floors?: unknown[]
      }
      const roster = Object.values(p.employees ?? {})
      setEmployees(roster)
      setFloorCount(Array.isArray(p.floors) ? p.floors.length : 0)
      setStatus('ready')

      // Load existing comments in parallel with rendering. A failure
      // here doesn't block the rest of the read-only view — comments
      // are an additive surface.
      setCommentsStatus('loading')
      const list = await listShareComments({ token, officeId: projectId })
      if (cancelled) return
      if (list === null) {
        setCommentsStatus('error')
      } else {
        setComments(list)
        setCommentsStatus('idle')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, token])

  // Anon viewers can't subscribe to Supabase realtime channels (no
  // SELECT permission on share_comments — they go through the RPC
  // path), so we approximate live updates with a poll-on-focus:
  // whenever the tab comes back to the foreground, re-fetch the
  // comment list. This catches the "owner replied while I was in
  // another tab" case, which is the most-common refresh trigger
  // for share-link reviewers.
  useEffect(() => {
    if (!projectId || !token) return
    let cancelled = false
    async function poll() {
      const list = await listShareComments({ token: token!, officeId: projectId! })
      if (cancelled) return
      if (list !== null) {
        setComments(list)
        setCommentsStatus('idle')
      }
    }
    function onVisible() {
      if (!document.hidden) void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [projectId, token])

  if (status === 'loading') return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading shared project…</div>
  if (status === 'invalid') return <div className="p-6 text-sm">This share link isn't valid.</div>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Shared read-only view</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {floorCount} floor{floorCount === 1 ? '' : 's'} · {employees.length} people
        </p>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
            <th className="py-2">Name</th>
            <th>Department</th>
            <th>Title</th>
            <th>Seat</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
              <td className="py-1">{e.name}</td>
              <td className="py-1">{e.department ?? ''}</td>
              <td className="py-1">{e.title ?? ''}</td>
              <td className="py-1">{e.seatId ? 'assigned' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {projectId && token && (
        <ShareCommentsPanel
          projectId={projectId}
          token={token}
          comments={comments}
          status={commentsStatus}
          onPosted={(c) => setComments((prev) => [c, ...prev])}
        />
      )}
    </div>
  )
}

function ShareCommentsPanel({
  projectId,
  token,
  comments,
  status,
  onPosted,
}: {
  projectId: string
  token: string
  comments: ShareComment[]
  status: 'idle' | 'loading' | 'error'
  onPosted: (c: ShareComment) => void
}) {
  const [body, setBody] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await addShareComment({
      token,
      officeId: projectId,
      body,
      authorName,
    })
    setBusy(false)
    if (result.kind === 'error') {
      setError(result.message)
      return
    }
    onPosted(result.comment)
    setBody('')
    // Keep the author name across submits — most reviewers leave
    // multiple comments and re-typing their name each time is friction.
  }

  return (
    <section
      aria-labelledby="share-comments-heading"
      className="border-t border-[color:var(--color-paper-line)] dark:border-gray-800 pt-6 space-y-4"
    >
      <h2 id="share-comments-heading" className="text-lg font-semibold">
        Comments
      </h2>

      <form onSubmit={onSubmit} className="space-y-2">
        <input
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          maxLength={80}
          placeholder="Your name (optional)"
          aria-label="Your name"
          disabled={busy}
          className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          placeholder="Leave a comment about this plan…"
          aria-label="Comment"
          disabled={busy}
          rows={3}
          className="block w-full rounded border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
        />
        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded bg-[color:var(--color-blueprint-strong)] text-white hover:bg-[color:var(--color-blueprint)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </form>

      <ul className="space-y-3">
        {status === 'loading' && comments.length === 0 && (
          <li className="text-xs text-gray-500 dark:text-gray-400">Loading comments…</li>
        )}
        {status === 'error' && (
          <li className="text-xs text-red-600 dark:text-red-400">
            Couldn&rsquo;t load comments. Try reloading the page.
          </li>
        )}
        {status === 'idle' && comments.length === 0 && (
          <li className="text-xs text-gray-500 dark:text-gray-400">
            No comments yet. Be the first.
          </li>
        )}
        {comments.map((c) => (
          <li
            key={c.id}
            className="rounded border border-[color:var(--color-paper-line)] dark:border-gray-800 p-3 bg-[color:var(--color-paper-raised)] dark:bg-gray-900"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {c.author_name?.trim() || 'Anonymous'}
              </span>
              <time
                dateTime={c.created_at}
                className="text-[11px] text-gray-500 dark:text-gray-400"
              >
                {new Date(c.created_at).toLocaleString()}
              </time>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
              {c.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
