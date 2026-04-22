import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { createTeam } from '../../lib/teams/teamRepository'
import { humanizeError } from '../../lib/errorMessages'

export function TeamOnboardingPage() {
  const session = useSession()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  if (session.status !== 'authenticated') return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (session.status !== 'authenticated') return
    setBusy(true)
    setError(null)
    try {
      const team = await createTeam(name)
      navigate(`/t/${team.slug}`, { replace: true })
    } catch (err) {
      setError(humanizeError(err))
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold">Create your first team</h1>
        <p className="text-sm text-gray-600">
          Offices you create live inside a team. You can invite teammates after.
        </p>
        <label className="block text-sm">
          <span className="block mb-1 text-gray-600">Team name</span>
          <input
            required
            className="w-full border rounded px-2 py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Creating\u2026' : 'Create team'}
        </button>
      </form>
    </div>
  )
}