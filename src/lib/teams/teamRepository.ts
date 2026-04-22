import { supabase } from '../supabase'
import { slugFromName } from '../slug'
import type { Team, TeamMember, Invite } from '../../types/team'

export async function createTeam(name: string): Promise<Team> {
  const slug = slugFromName(name)
  const { data, error } = await supabase
    .from('teams')
    .insert({ name, slug })
    .select('id, slug, name, created_by, created_at')
    .single()
  if (error) throw error
  return data as Team
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, user_id, role, joined_at, profiles!inner(email,name)')
    .eq('team_id', teamId)
  if (error) throw error
  // Supabase's generated types treat `profiles!inner(...)` as a relation
  // and can model it as an array OR a single object depending on the
  // foreign-key cardinality it infers. Our FK is user_id 1-1 with
  // auth.users.id, so it's always a single row at runtime, but we widen
  // through `unknown` so the compiler accepts the shape we know we get.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  return rows.map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      team_id: row.team_id as string,
      user_id: row.user_id as string,
      role: row.role as 'admin' | 'member',
      joined_at: row.joined_at as string,
      email: profile?.email as string,
      name: (profile?.name as string | null) ?? undefined,
    }
  }) as TeamMember[]
}

export async function listInvites(teamId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('team_id', teamId)
    .is('accepted_at', null)
  if (error) throw error
  return data as Invite[]
}

export async function createInvite(teamId: string, email: string, invitedBy: string): Promise<Invite> {
  const { data, error } = await supabase
    .from('invites')
    .insert({ team_id: teamId, email, invited_by: invitedBy })
    .select('*')
    .single()
  if (error) throw error
  return data as Invite
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function updateMemberRole(
  teamId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .update({ role })
    .eq('team_id', teamId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  const { error } = await supabase.from('teams').update({ name }).eq('id', teamId)
  if (error) throw error
}

export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', teamId)
  if (error) throw error
}
