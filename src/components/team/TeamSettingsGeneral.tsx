import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Check, Trash2 } from 'lucide-react'
import type { Team } from '../../types/team'
import { renameTeam, deleteTeam } from '../../lib/teams/teamRepository'
import { humanizeError } from '../../lib/errorMessages'
import { Button, Input } from '../ui'

/**
 * Wave 17C: polished general-settings tab.
 *
 * Structure:
 *  - "Team identity" card: name input + save button, plus a read-only
 *    slug row with a "copy team link" button (useful for sending
 *    someone the `/t/{slug}` URL without them asking).
 *  - "Danger zone" card (admin only): red-tinted surface; the
 *    type-to-confirm delete modal is preserved verbatim from the
 *    previous iteration because it was already the right shape and
 *    the harness test for it lives on a specific input label.
 *
 * No logo uploader is added here — the schema for team logos isn't
 * part of this polish pass, and this PR is explicitly presentation +
 * structure only. The identity header in the shell renders
 * `team.logo_url` if it ever becomes present.
 */

export function TeamSettingsGeneral({ team, isAdmin }: { team: Team; isAdmin: boolean }) {
  const [name, setName] = useState(team.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Type-to-confirm destructive delete. `window.confirm` was trivially
  // dismissible — an admin could lose the entire team's data by
  // misclicking through a browser prompt. Forcing them to type the
  // team name (matched case-insensitively, trimmed) makes accidental
  // deletion vanishingly unlikely while still being keyboard-friendly.
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const navigate = useNavigate()

  const canConfirm =
    confirmInput.trim().toLowerCase() === team.name.trim().toLowerCase()

  async function onRename() {
    setBusy(true)
    setError(null)
    try {
      await renameTeam(team.id, name)
    } catch (e) {
      setError(humanizeError(e))
    }
    setBusy(false)
  }

  async function onDeleteConfirmed() {
    if (!canConfirm) return
    setBusy(true)
    setError(null)
    try {
      await deleteTeam(team.id)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(humanizeError(e))
      setBusy(false)
    }
  }

  function openConfirm() {
    setConfirmInput('')
    setError(null)
    setConfirmOpen(true)
  }

  function closeConfirm() {
    setConfirmOpen(false)
    setConfirmInput('')
  }

  async function copyTeamLink() {
    const url = `${window.location.origin}/t/${team.slug}`
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 1800)
    } catch {
      // Clipboard API can reject in insecure contexts; the URL is
      // visible in the input either way.
    }
  }

  return (
    <div className="space-y-6 max-w-2xl text-sm">
      {/* -------------------------------------------------------------
          Team identity card. Uppercase section label + the two fields
          (name, slug) stacked in a panel so the tab doesn't read as a
          loose form floating in whitespace.
          ------------------------------------------------------------- */}
      <section aria-labelledby="team-identity-heading" className="space-y-3">
        <h2
          id="team-identity-heading"
          className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
        >
          Team identity
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/60 p-5 space-y-4">
          <label className="block">
            <span className="block mb-1 text-gray-700 dark:text-gray-300">
              Team name
            </span>
            <Input
              id="team-name"
              aria-label="Team name"
              disabled={!isAdmin || busy}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div>
            <div className="mb-1 text-gray-700 dark:text-gray-300">
              Team link
            </div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                aria-label="Team link"
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/t/${team.slug}`}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={copyTeamLink}
                leftIcon={linkCopied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              >
                {linkCopied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Members with an account can visit this URL directly. Use
              the Members tab to invite new teammates.
            </p>
          </div>

          {isAdmin && (
            <div className="pt-2">
              <Button
                variant="primary"
                onClick={onRename}
                disabled={busy || name.trim() === '' || name === team.name}
              >
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          )}

          {error && !confirmOpen && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------
          Danger zone. Red-tinted card with a single row per destructive
          action. Only rendered to admins because non-admins have no
          affordance here that makes sense.
          ------------------------------------------------------------- */}
      {isAdmin && (
        <section aria-labelledby="danger-zone-heading" className="space-y-3">
          <h2
            id="danger-zone-heading"
            className="text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400"
          >
            Danger zone
          </h2>
          <div className="rounded-xl border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  Delete team
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Permanently removes every office, floor plan, and
                  roster. All members lose access immediately. This
                  cannot be undone.
                </div>
              </div>
              <Button
                variant="danger"
                onClick={openConfirm}
                disabled={busy}
                leftIcon={<Trash2 size={14} aria-hidden="true" />}
                className="shrink-0"
              >
                Delete team
              </Button>
            </div>
          </div>
        </section>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={closeConfirm}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-base font-semibold text-red-700 dark:text-red-300">
              Delete team?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This permanently removes <b>{team.name}</b>, every office in
              it, and removes all members. This cannot be undone.
            </p>
            <label className="block text-sm">
              <span className="block mb-1 text-gray-600 dark:text-gray-300">
                Type <b>{team.name}</b> to confirm
              </span>
              <Input
                autoFocus
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canConfirm && !busy) {
                    void onDeleteConfirmed()
                  }
                  if (e.key === 'Escape') closeConfirm()
                }}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={closeConfirm} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={onDeleteConfirmed}
                disabled={!canConfirm || busy}
              >
                {busy ? 'Deleting…' : 'Delete team'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
