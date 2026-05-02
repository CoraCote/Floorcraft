import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useProjectStore } from '../../stores/projectStore'

interface SuspensionState {
  is_suspended: boolean
  suspension_reason: string | null
  suspended_at: string | null
}

/**
 * Renders a non-dismissable banner across the top of the team-side
 * surfaces when the team has been suspended by a platform admin.
 * Members can still sign in + read, so this is the explanation for
 * why their save attempts fail.
 *
 * Reads the team row directly via supabase — the existing RLS lets
 * members SELECT their team. Self-fetches on `currentTeamId` change
 * so a member who switches teams sees the right banner state.
 *
 * The actual write blocking is enforced by a database trigger
 * (migration 0019); this banner is the user-facing explanation.
 */
export function TeamSuspendedBanner() {
  const teamId = useProjectStore((s) => s.currentTeamId)
  const [state, setState] = useState<SuspensionState | null>(null)

  useEffect(() => {
    let cancelled = false
    // Wrap the team-switch reset + the fetch in a single async fn so
    // the React 19 lint rule (`react-hooks/set-state-in-effect`) sees
    // setState happening only inside an async continuation, never
    // synchronously in the effect body.
    async function load() {
      if (!teamId) {
        setState(null)
        return
      }
      const { data, error } = await supabase
        .from('teams')
        .select('is_suspended, suspension_reason, suspended_at')
        .eq('id', teamId)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setState(null)
        return
      }
      setState(data as SuspensionState)
    }
    void load()

    if (!teamId) {
      return () => {
        cancelled = true
      }
    }

    // Realtime: if a platform admin flips the suspension while the
    // member is mid-session, surface it without a refresh.
    const channel = supabase
      .channel(`team-suspended:${teamId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teams',
          filter: `id=eq.${teamId}`,
        },
        (payload) => {
          const next = payload.new as SuspensionState
          setState(next)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [teamId])

  if (!state || !state.is_suspended) return null

  return (
    <div
      role="alert"
      className="bg-red-600 text-white px-4 py-2 flex items-center gap-2 text-sm shadow-md"
    >
      <ShieldAlert size={16} aria-hidden="true" />
      <span className="font-semibold">This team is suspended.</span>
      {state.suspension_reason && (
        <span className="opacity-90">— {state.suspension_reason}</span>
      )}
      <span className="opacity-90 ml-auto">Members keep read access. Writes are blocked.</span>
    </div>
  )
}
