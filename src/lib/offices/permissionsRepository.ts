import { supabase } from '../supabase'

export type OfficeRole = 'owner' | 'editor' | 'viewer'

export interface OfficePermEntry {
  user_id: string
  email: string
  name: string | null
  role: OfficeRole
  isSelf: boolean
}

/**
 * Returns one row per team member of the office's team, merged with any
 * explicit `office_permissions` override. Members without an override fall
 * back to the default `editor` role — the visibility setting on the office
 * row decides whether that default is actually editable or view-only.
 */
export async function listPermissions(
  officeId: string,
  selfId: string,
  teamId: string,
): Promise<OfficePermEntry[]> {
  const { data: members, error } = await supabase
    .from('team_members')
    .select('user_id, profiles!inner(email, name)')
    .eq('team_id', teamId)
  if (error) throw error
  const { data: perms } = await supabase
    .from('office_permissions')
    .select('user_id, role')
    .eq('office_id', officeId)
  const roleMap = new Map<string, OfficeRole>(
    (perms ?? []).map((p: { user_id: string; role: string }) => [p.user_id, p.role as OfficeRole]),
  )
  return (members ?? []).map((m: { user_id: string; profiles: unknown }) => {
    const prof = m.profiles as { email: string; name: string | null }
    return {
      user_id: m.user_id,
      email: prof.email,
      name: prof.name,
      role: roleMap.get(m.user_id) ?? 'editor',
      isSelf: m.user_id === selfId,
    }
  })
}

export async function upsertPermission(
  officeId: string,
  userId: string,
  role: OfficeRole,
): Promise<void> {
  const { error } = await supabase
    .from('office_permissions')
    .upsert({ office_id: officeId, user_id: userId, role }, { onConflict: 'office_id,user_id' })
  if (error) throw error
}

export async function removePermission(officeId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('office_permissions')
    .delete()
    .eq('office_id', officeId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function setOfficePrivate(officeId: string, isPrivate: boolean): Promise<void> {
  const { error } = await supabase
    .from('offices')
    .update({ is_private: isPrivate })
    .eq('id', officeId)
  if (error) throw error
}
