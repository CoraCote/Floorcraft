import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useSession } from './auth/AuthProvider'

/**
 * Cached platform-admin check for the current session. The flag is
 * sticky for the lifetime of the auth session — granting / revoking
 * yourself takes effect on next sign-in (or full reload). For
 * teammate-side updates the AdminUsersPage mutation does an
 * optimistic refetch.
 *
 * Returns `null` while the check is pending so the caller can render
 * a "loading" state instead of flashing the unauth view.
 */
export function useIsPlatformAdmin(): boolean | null {
  const session = useSession()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (session.status !== 'authenticated') {
        setIsAdmin(false)
        return
      }
      const { data, error } = await supabase.rpc('is_current_user_platform_admin')
      if (cancelled) return
      if (error) {
        setIsAdmin(false)
        return
      }
      setIsAdmin(Boolean(data))
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [session.status])
  return isAdmin
}

export interface PlatformOverview {
  users: number
  teams: number
  offices: number
  signups_7d: number
  signups_30d: number
  admins: number
}

export async function getPlatformOverview(): Promise<PlatformOverview | null> {
  const { data, error } = await supabase.rpc('get_platform_overview')
  if (error) {
    console.warn('[platform-admin] overview failed', error)
    return null
  }
  return data as PlatformOverview
}

export interface PlatformAdminRow {
  id: string
  email: string
  name: string | null
  created_at: string
}

export async function listPlatformAdmins(): Promise<PlatformAdminRow[] | null> {
  const { data, error } = await supabase.rpc('list_platform_admins')
  if (error) {
    console.warn('[platform-admin] list failed', error)
    return null
  }
  return (data ?? []) as PlatformAdminRow[]
}

export async function grantPlatformAdmin(
  userId: string,
): Promise<
  | { kind: 'ok' }
  | { kind: 'error'; reason: 'user_not_found' | 'forbidden' | 'unknown'; message: string }
> {
  const { error } = await supabase.rpc('grant_platform_admin', { p_user_id: userId })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('user_not_found'))
      return { kind: 'error', reason: 'user_not_found', message: 'No user with that id.' }
    if (msg.includes('forbidden'))
      return { kind: 'error', reason: 'forbidden', message: 'Only platform admins can grant the role.' }
    return { kind: 'error', reason: 'unknown', message: msg || 'Something went wrong.' }
  }
  return { kind: 'ok' }
}

export async function revokePlatformAdmin(
  userId: string,
): Promise<
  | { kind: 'ok' }
  | { kind: 'error'; reason: 'last_admin' | 'forbidden' | 'unknown'; message: string }
> {
  const { error } = await supabase.rpc('revoke_platform_admin', { p_user_id: userId })
  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('last_admin_protected'))
      return {
        kind: 'error',
        reason: 'last_admin',
        message: "Can't revoke the only remaining platform admin.",
      }
    if (msg.includes('forbidden'))
      return { kind: 'error', reason: 'forbidden', message: 'Only platform admins can revoke the role.' }
    return { kind: 'error', reason: 'unknown', message: msg || 'Something went wrong.' }
  }
  return { kind: 'ok' }
}

export interface UserLookup {
  id: string
  email: string
  name: string | null
  is_platform_admin: boolean
}

export async function findUserByEmail(email: string): Promise<UserLookup | null> {
  const { data, error } = await supabase.rpc('find_user_by_email', { p_email: email })
  if (error) {
    console.warn('[platform-admin] find user failed', error)
    return null
  }
  const rows = (data ?? []) as UserLookup[]
  return rows[0] ?? null
}
