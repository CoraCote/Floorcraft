import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Team } from '../../types/team'

export function useMyTeams() {
  const [teams, setTeams] = useState<Team[] | null>(null)
  useEffect(() => {
    supabase
      .from('teams')
      .select('id, slug, name, created_by, created_at')
      .order('created_at', { ascending: true })
      .then(({ data }) => setTeams(data ?? []))
  }, [])
  return teams
}
