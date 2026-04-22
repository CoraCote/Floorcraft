import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Team } from '../../types/team'
import { renameTeam, deleteTeam } from '../../lib/teams/teamRepository'
import { humanizeError } from '../../lib/errorMessages'

export function TeamSettingsGeneral({ team, isAdmin }: { team: Team; isAdmin: boolean }) {
  const [name, setName] = useState(team.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Type-to-confirm destructive delete. `window.confirm` was trivially
  // dismissible — an admin could lose the entire team's data by
  // misclicking through a browser prompt. Forcing them to type the team
  // name (matched case-insensitively, trimmed) makes accidental
  // deletion vanishingly unlikely while still being keyboard-friendly.
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
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

  return (
    <div className="max-w-xl space-y-6 text-sm">
      <section className="space-y-2">
        <h2 className="font-semibold">General</h2>
        <label className="block">
          <span className="block mb-1 text-gray-600">Team name</span>
          <input
            disabled={!isAdmin || busy}
            className="w-full border rounded px-2 py-1.5 disabled:bg-gray-50"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {isAdmin && (
          <button
            onClick={onRename}
            disabled={busy || name === team.name}
            className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Save
          </button>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-2 border-t pt-4">
          <h2 className="font-semibold text-red-700">Danger zone</h2>
          <button
            onClick={openConfirm}
            disabled={busy}
            className="px-3 py-1.5 bg-red-600 text-white rounded disabled:opacity-50"
          >
            Delete team
          </button>
        </section>
      )}

      {error && <p className="text-red-600">{error}</p>}

      {confirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={closeConfirm}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-red-700">
              Delete team?
            </h3>
            <p className="text-sm text-gray-600">
              This permanently removes <b>{team.name}</b>, every office in
              it, and removes all members. This cannot be undone.
            </p>
            <label className="block text-sm">
              <span className="block mb-1 text-gray-600">
                Type <b>{team.name}</b> to confirm
              </span>
              <input
                autoFocus
                className="w-full border rounded px-2 py-1.5"
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
            <div className="flex gap-2 justify-end">
              <button
                onClick={closeConfirm}
                disabled={busy}
                className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={onDeleteConfirmed}
                disabled={!canConfirm || busy}
                className="px-3 py-1.5 bg-red-600 text-white rounded disabled:opacity-40"
              >
                {busy ? 'Deleting…' : 'Delete team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
