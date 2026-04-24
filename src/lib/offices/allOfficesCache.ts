/**
 * Lightweight per-team cache for office list items + their loaded payloads.
 * Populated on-demand (e.g. when the cross-office command palette opens)
 * so the global search can read every office without re-fetching on
 * every keystroke.
 *
 * We DO NOT attempt real-time invalidation here. The cache is a session-
 * scoped, best-effort snapshot; a stale entry shows the previous name or
 * missing employee for a moment until the operator refreshes. Trading
 * perfect freshness for a dead-simple shape is the explicit call — a
 * global search is an assist feature, not a source of truth.
 */

import { listOffices, loadOffice, type OfficeListItem, type OfficeLoaded } from './officeRepository'

export interface AllOfficePayload extends OfficeListItem {
  // `OfficeListItem.payload` is already optional (the team-home thumbnail
  // pulls it in); the cache additionally allows `null` to distinguish
  // "we tried and the row had no payload / failed to load" from "we
  // haven't tried yet". Widen here without re-declaring the parent type.
  payload: OfficeLoaded['payload'] | null | undefined
}

const cache = new Map<string, AllOfficePayload[]>()
const inflight = new Map<string, Promise<AllOfficePayload[]>>()

export function getCachedOffices(teamId: string): AllOfficePayload[] | null {
  return cache.get(teamId) ?? null
}

export async function primeAllOffices(
  teamId: string,
  teamSlug: string,
): Promise<AllOfficePayload[]> {
  const existing = cache.get(teamId)
  if (existing) return existing
  const pending = inflight.get(teamId)
  if (pending) return pending
  const p = (async () => {
    const list = await listOffices(teamId)
    // Load payloads in parallel. For a typical team (a handful of offices)
    // this is cheap; a massive team (100+) would want chunking, but we
    // pragmatically defer that until we see it.
    const results = await Promise.all(
      list.map(async (o) => {
        const loaded = await loadOffice(teamId, o.slug).catch(() => null)
        return { ...o, payload: loaded?.payload ?? null }
      }),
    )
    cache.set(teamId, results)
    // `teamSlug` is stashed on the entries via closure elsewhere (slug comes
    // straight off the row), so the caller doesn't need to thread it through.
    void teamSlug
    return results
  })()
  inflight.set(teamId, p)
  try {
    return await p
  } finally {
    inflight.delete(teamId)
  }
}

/** Test hook — clears cached state between runs. */
export function __resetAllOfficesCacheForTests(): void {
  cache.clear()
  inflight.clear()
}
