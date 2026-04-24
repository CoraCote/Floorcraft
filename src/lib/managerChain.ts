import type { Employee } from '../types/employee'

/**
 * Guard against pathological manager chains — bad imports can produce
 * loops, and while `findManagerCycle` prevents new ones, this cap keeps
 * the walker from hanging on already-poisoned data. 100 is plenty: a real
 * org with that many reporting layers would be a separate, louder bug.
 */
const MAX_CHAIN_DEPTH = 100

/**
 * Would assigning `candidateManagerId` as `startId`'s manager create a
 * cycle? If yes, returns the resulting loop (startId → … → startId).
 * Returns `null` for the safe case.
 *
 * The walk starts at `candidateManagerId` and follows each manager's own
 * `managerId`. If it revisits `startId`, the proposed write would close a
 * loop. Self-assignment (startId === candidateManagerId) is the trivial
 * 1-node case.
 */
export function findManagerCycle(
  employees: Record<string, Employee>,
  startId: string,
  candidateManagerId: string | null,
): string[] | null {
  if (!candidateManagerId) return null
  if (candidateManagerId === startId) {
    // Self-reference: "A reports to A".
    return [startId, startId]
  }

  const path: string[] = [startId, candidateManagerId]
  let cursor: string | null = candidateManagerId
  const seen = new Set<string>([startId])
  // Depth-cap against already-broken data. If the existing chain is
  // self-contained (never touches `startId`) we just return null — the
  // proposed write is safe even though the ancestor data is messy.
  for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
    if (cursor === null) return null
    if (seen.has(cursor) && cursor !== candidateManagerId) {
      // Pre-existing loop that doesn't involve `startId` — not caused by
      // this edit, so don't block it.
      return null
    }
    const mgr: Employee | undefined = employees[cursor]
    if (!mgr) return null
    const next: string | null = mgr.managerId
    if (next === null) return null
    if (next === startId) {
      path.push(next)
      return path
    }
    path.push(next)
    seen.add(cursor)
    cursor = next
  }
  return null
}

/**
 * Walk up the manager chain from `id`, returning every ancestor in order
 * (closest manager first). Capped at `MAX_CHAIN_DEPTH` to defend against
 * pre-existing cycles in imported data — the cap is enough headroom to
 * accommodate any realistic org, while still terminating on corrupt input.
 */
export function getManagerChain(
  employees: Record<string, Employee>,
  id: string,
): Employee[] {
  const chain: Employee[] = []
  const seen = new Set<string>([id])
  let cursor = employees[id]?.managerId ?? null
  for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
    if (cursor === null) break
    if (seen.has(cursor)) break
    const mgr = employees[cursor]
    if (!mgr) break
    chain.push(mgr)
    seen.add(cursor)
    cursor = mgr.managerId
  }
  return chain
}
