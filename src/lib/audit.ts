import { insertEvent } from './auditRepository'
import { useProjectStore } from '../stores/projectStore'

/**
 * Best-effort emission of an audit event. Never throws, never blocks the
 * caller. If the supabase call fails we log and move on — the user's
 * action should have already committed.
 *
 * Skips emission when team or user id is unknown (e.g. pre-login, or
 * anonymous share-link usage). This keeps the helper safe to call from
 * any store mutation.
 */
export async function emit(
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { currentTeamId, currentUserId } = useProjectStore.getState()
  if (!currentTeamId || !currentUserId) return
  try {
    await insertEvent({
      team_id: currentTeamId,
      actor_id: currentUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
    })
  } catch (err) {
    console.error('[audit] emit failed', { action, targetType, targetId, err })
  }
}
