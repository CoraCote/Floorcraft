import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'
import { listOffices, createOffice, type OfficeListItem } from '../../lib/offices/officeRepository'
import { formatRelative } from '../../lib/time'
import type { Team } from '../../types/team'

export function TeamHomePage() {
  const { teamSlug } = useParams<{ teamSlug: string }>()
  const [team, setTeam] = useState<Team | null>(null)
  const [offices, setOffices] = useState<OfficeListItem[]>([])
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const session = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from('teams').select('*').eq('slug', teamSlug).single()
      if (!t) return
      setTeam(t as Team)
      setOffices(await listOffices((t as Team).id))
    }
    load()
  }, [teamSlug])

  async function onNew() {
    if (!team || session.status !== 'authenticated') return
    setCreating(true)
    const created = await createOffice(team.id, session.user.id, 'Untitled office')
    navigate(`/t/${team.slug}/o/${created.slug}/map`)
  }

  if (!team) return <div className="p-6 text-sm text-gray-500">Loading…</div>
  const visible = offices.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{team.name}</h1>
        <div className="flex items-center gap-2">
          <input
            placeholder="Search offices…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm w-56"
          />
          <button
            onClick={onNew}
            disabled={creating}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            New office
          </button>
          <Link
            to={`/t/${team.slug}/settings`}
            className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
          >
            Settings
          </Link>
        </div>
      </header>
      {visible.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500">
          {q ? (
            'No matches.'
          ) : (
            <>
              No offices yet —{' '}
              <button className="text-blue-600 hover:underline" onClick={onNew}>
                create your first
              </button>
              .
            </>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((o) => (
            <li key={o.id}>
              <Link
                to={`/t/${team.slug}/o/${o.slug}/map`}
                className="block border rounded-lg p-4 hover:shadow hover:border-blue-300 bg-white"
              >
                <div className="font-medium">{o.name}</div>
                <div className="text-xs text-gray-500 mt-1">Updated {formatRelative(o.updated_at)}</div>
                {o.is_private && <div className="text-xs mt-2 text-amber-700">Private</div>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
