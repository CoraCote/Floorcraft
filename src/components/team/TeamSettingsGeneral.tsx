import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Team } from '../../types/team'
import { renameTeam, deleteTeam } from '../../lib/teams/teamRepository'

export function TeamSettingsGeneral({ team, isAdmin }: { team: Team; isAdmin: boolean }) {
  const [name, setName] = useState(team.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function onRename() {
    setBusy(true)
    setError(null)
    try {
      await renameTeam(team.id, name)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }
  async function onDelete() {
    if (!confirm(`Delete ${team.name}? This removes all offices and members. Cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteTeam(team.id)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
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
            onClick={onDelete}
            disabled={busy}
            className="px-3 py-1.5 bg-red-600 text-white rounded disabled:opacity-50"
          >
            Delete team
          </button>
        </section>
      )}

      {error && <p className="text-red-600">{error}</p>}
    </div>
  )
}
