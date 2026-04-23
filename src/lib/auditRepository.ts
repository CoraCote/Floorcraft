import { supabase } from './supabase'

/**
 * Wire format for `audit_events` rows. `id` and `created_at` are
 * server-assigned (defaults in the migration) so callers leave them off
 * on insert.
 */
export interface AuditEventRow {
  id?: string
  team_id: string
  actor_id: string
  action: string
  target_type: string
  target_id: string | null
  metadata: Record<string, unknown>
  created_at?: string
}

/**
 * Insert a single audit row. Throws on supabase error — the caller
 * (`audit.emit`) catches and logs so application code never sees it.
 */
export async function insertEvent(row: AuditEventRow): Promise<void> {
  const { error } = await supabase.from('audit_events').insert(row)
  if (error) throw error
}

export interface ListOptions {
  actorId?: string
  action?: string
  from?: string
  to?: string
  limit?: number
}

/**
 * Read audit rows for a team, filtered + ordered newest-first. RLS on
 * `audit_events` gates visibility to team members, so an unauthorized
 * caller gets an empty list rather than an error.
 */
export async function listEvents(
  teamId: string,
  opts: ListOptions = {},
): Promise<AuditEventRow[]> {
  let q = supabase.from('audit_events').select('*').eq('team_id', teamId)
  if (opts.actorId) q = q.eq('actor_id', opts.actorId)
  if (opts.action) q = q.eq('action', opts.action)
  if (opts.from) q = q.gte('created_at', opts.from)
  if (opts.to) q = q.lte('created_at', opts.to)
  q = q.order('created_at', { ascending: false }).limit(opts.limit ?? 200)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AuditEventRow[]
}
