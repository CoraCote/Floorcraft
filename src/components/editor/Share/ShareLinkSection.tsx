import { useEffect, useState } from 'react'
import { useCan } from '../../../hooks/useCan'
import { useProjectStore } from '../../../stores/projectStore'
import {
  createShareToken,
  listShareTokens,
  revokeShareToken,
  type ShareToken,
} from '../../../lib/shareTokens'
import { emit } from '../../../lib/audit'

/**
 * Read-only share link section, surfaced inside the ShareModal. Only
 * Owners (per the Phase 5 permissions matrix) see it — the
 * `generateShareLink` action is Owner-only. Tokens are bearer links:
 * anyone with the URL can view the office roster. Revocation is
 * manual — there's no TTL, and the RLS policy on `share_tokens` looks
 * at `revoked_at IS NULL` to decide visibility.
 */
export function ShareLinkSection() {
  const canGenerate = useCan('generateShareLink')
  const officeId = useProjectStore((s) => s.officeId)
  const [tokens, setTokens] = useState<ShareToken[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!officeId) return
    let cancelled = false
    listShareTokens(officeId)
      .then((rows) => {
        if (!cancelled) setTokens(rows.filter((r) => !r.revoked_at))
      })
      .catch((err) => console.error('[share] list failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [officeId])

  if (!canGenerate) return null

  async function onGenerate() {
    if (!officeId) return
    setBusy(true)
    try {
      const t = await createShareToken(officeId)
      setTokens((prev) => [t, ...prev])
      void emit('share_token_created', 'office', officeId ?? null, { token_id: t.id })
    } finally {
      setBusy(false)
    }
  }

  async function onRevoke(id: string) {
    await revokeShareToken(id)
    setTokens((prev) => prev.filter((t) => t.id !== id))
    void emit('share_token_revoked', 'office', officeId ?? null, { token_id: id })
  }

  return (
    <section className="border-t border-gray-100 dark:border-gray-800 pt-4 mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Read-only share link</h3>
        <button
          onClick={onGenerate}
          disabled={busy || !officeId}
          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-800 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          {busy ? 'Generating…' : 'Generate new link'}
        </button>
      </div>
      {loading ? <div className="text-xs text-gray-500 dark:text-gray-400">Loading…</div> : null}
      <ul className="space-y-1 text-xs">
        {tokens.map((t) => {
          const url = `${window.location.origin}/shared/${t.office_id}/${t.token}`
          return (
            <li key={t.id} className="flex items-center gap-2">
              <code className="flex-1 truncate bg-gray-50 dark:bg-gray-800/50 px-2 py-1 rounded">{url}</code>
              <button
                onClick={() => navigator.clipboard?.writeText(url)}
                className="px-2 py-1 border border-gray-200 dark:border-gray-800 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                Copy
              </button>
              <button
                onClick={() => onRevoke(t.id)}
                className="px-2 py-1 border border-red-200 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Revoke
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
