import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/auth/session'
import type { Team } from '../../types/team'

export function TeamSettingsPage() {
  const { teamSlug } = useParams<{ teamSlug: string }>()
  const [team, setTeam] = useState<Team | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const session = useSession()

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from('teams').select('*').eq('slug', teamSlug).single()
      if (!t) return
      setTeam(t as Team)
      if (session.status === 'authenticated') {
        const { data: m } = await supabase
          .from('team_members')
          .select('role')
          .eq('team_id', (t as Team).id)
          .eq('user_id', session.user.id)
          .single()
        setIsAdmin((m as { role?: string } | null)?.role === 'admin')
      }
    }
    load()
  }, [teamSlug, session])

  if (!team) return <div className="p-6 text-sm text-gray-500">Loading team…</div>

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">{team.name} — Settings</h1>
      </header>
      <nav className="flex gap-4 border-b mb-4">
        <NavLink
          end
          to="."
          className={({ isActive }) =>
            `pb-2 ${isActive ? 'border-b-2 border-blue-600 font-medium' : 'text-gray-500'}`
          }
        >
          General
        </NavLink>
        <NavLink
          to="members"
          className={({ isActive }) =>
            `pb-2 ${isActive ? 'border-b-2 border-blue-600 font-medium' : 'text-gray-500'}`
          }
        >
          Members
        </NavLink>
      </nav>
      <Outlet context={{ team, isAdmin }} />
    </div>
  )
}
