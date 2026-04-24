import { useEffect, useState } from 'react'
import { useShareLinksStore, SHARE_LINK_TTL_OPTIONS } from '../../stores/shareLinksStore'
import { useProjectStore } from '../../stores/projectStore'
import { buildShareUrl } from '../../lib/shareLinkUrl'
import { Button, Modal, ModalBody } from '../ui'

/**
 * Dialog for generating + managing D6 view-only share links. Triggered by
 * the "Share Link" button in the TopBar (gated behind `editMap`). The dialog
 * is self-gated additionally: if no office is loaded the modal renders a
 * disabled state rather than silently no-opping.
 *
 * Countdowns tick every 15s — fine-grained enough that a user watching
 * the dialog sees progress, cheap enough to not matter on a modal that
 * only exists for a minute or two.
 */
interface Props {
  open: boolean
  onClose: () => void
}

export function ShareLinkDialog({ open, onClose }: Props) {
  const officeId = useProjectStore((s) => s.officeId)
  const currentProject = useProjectStore((s) => s.currentProject)
  const userId = useProjectStore((s) => s.currentUserId)
  const links = useShareLinksStore((s) => s.links)
  const createLink = useShareLinksStore((s) => s.create)
  const revokeLink = useShareLinksStore((s) => s.revoke)

  const [ttlSeconds, setTtlSeconds] = useState<number>(SHARE_LINK_TTL_OPTIONS[1].seconds)
  const [label, setLabel] = useState('')
  const [justCopied, setJustCopied] = useState<string | null>(null)
  // Track the current wall-clock time in state so expiry countdowns can be
  // computed from a stable value in render (React Compiler's `impure-call`
  // rule forbids `Date.now()` inside the render body). The interval below
  // refreshes this every 15s while the dialog is open.
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // Countdown re-render tick. Only runs while the dialog is open — no
  // reason to wake the tab up when the user isn't looking at expiry.
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setNowMs(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [open])

  const activeLinks = Object.values(links)
    .filter((l) => l.officeId === officeId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  const slug = currentProject?.slug ?? officeId ?? ''

  const handleGenerate = () => {
    if (!officeId) return
    const trimmed = label.trim()
    createLink(officeId, ttlSeconds, trimmed.length > 0 ? trimmed : undefined, {
      id: userId,
      name: null,
    })
    setLabel('')
  }

  const handleCopy = (token: string) => {
    const absolute = new URL(buildShareUrl(slug, token), window.location.origin).toString()
    void navigator.clipboard?.writeText(absolute)
    setJustCopied(token)
    setTimeout(() => setJustCopied((t) => (t === token ? null : t)), 1500)
  }

  return (
    <Modal open={open} onClose={onClose} title="Share view-only link" size="lg">
      <ModalBody className="max-h-[75vh] overflow-y-auto">
        <section className="space-y-3 pb-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">Generate new link</h3>
          <fieldset>
            <legend className="text-xs text-gray-500 dark:text-gray-400 mb-1">Duration</legend>
            <div className="flex flex-wrap gap-3">
              {SHARE_LINK_TTL_OPTIONS.map((opt) => (
                <label key={opt.seconds} className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="ttl"
                    value={opt.seconds}
                    checked={ttlSeconds === opt.seconds}
                    onChange={() => setTtlSeconds(opt.seconds)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm">
            <span className="text-xs text-gray-500 dark:text-gray-400">Label (optional)</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. board review"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-sm"
            />
          </label>
          <Button
            type="button"
            variant="primary"
            onClick={handleGenerate}
            disabled={!officeId}
          >
            Generate link
          </Button>
        </section>

        <section className="pt-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            Existing links ({activeLinks.length})
          </h3>
          {activeLinks.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">No links yet.</p>
          )}
          <ul className="space-y-2">
            {activeLinks.map((l) => {
              const url = buildShareUrl(slug, l.token)
              const expiresMs = new Date(l.expiresAt).getTime() - nowMs
              const expired = expiresMs <= 0
              const status = l.revokedAt
                ? 'Revoked'
                : expired
                  ? 'Expired'
                  : `Expires in ${formatDuration(expiresMs)}`
              return (
                <li
                  key={l.id}
                  className="border border-gray-200 dark:border-gray-800 rounded p-2 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    {l.label && (
                      <div className="text-sm font-medium truncate">{l.label}</div>
                    )}
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={url}>
                      {url}
                    </div>
                    <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">{status}</div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopy(l.token)}
                      disabled={!!l.revokedAt || expired}
                    >
                      {justCopied === l.token ? 'Copied' : 'Copy'}
                    </Button>
                    {!l.revokedAt && !expired && (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => revokeLink(l.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </ModalBody>
    </Modal>
  )
}

/**
 * Compact "expires in…" formatter. Milliseconds → largest-unit string.
 * Tuned for human quick-scan rather than precision — "in 23h" reads
 * better than "23h 59m 12s" in the link list.
 */
function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}
