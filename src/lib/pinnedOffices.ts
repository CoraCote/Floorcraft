/**
 * LocalStorage-backed pinned-offices list, scoped per-team so a user
 * who works across multiple teams doesn't see Team A's pins polluting
 * Team B's dashboard.
 *
 * Mirrors `recentOffices.ts` in shape — same defensive read, same
 * silent-on-failure write — but is a *user-curated* list rather than
 * an MRU feed. Pinning persists across sessions; the dashboard sorts
 * pinned offices to the top of the grid (or renders them in their
 * own row, depending on the layout).
 *
 * Contract:
 *   - `togglePin(teamSlug, officeSlug)` toggles inclusion. The boolean
 *     return value is the post-toggle state, so the caller can update
 *     local UI without re-reading.
 *   - `getPins(teamSlug)` returns the current set, head-first by pin
 *     order (most-recently pinned first). Caller gets a fresh array.
 *   - `isPinned(teamSlug, officeSlug)` is a sync read — fine for
 *     render because storage access is synchronous and tiny.
 *
 * No MAX cap: pinning is intentional, not automatic. A team admin
 * with 30 offices who pins all of them gets all 30 — the UI handles
 * overflow. (The recents list does cap at 5 because it's automatic.)
 */

const KEY_PREFIX = 'floocraft.pinnedOffices.'

function keyFor(teamSlug: string): string {
  return KEY_PREFIX + teamSlug
}

function readRaw(teamSlug: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(teamSlug))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}

export function getPins(teamSlug: string): string[] {
  return readRaw(teamSlug)
}

export function isPinned(teamSlug: string, officeSlug: string): boolean {
  return readRaw(teamSlug).includes(officeSlug)
}

/**
 * Toggle pin state. Returns true if the office is pinned after this
 * call, false if it was unpinned. Silently no-ops on storage failure
 * and returns the pre-call state — callers using the return value
 * for optimistic UI will simply not see a flip, which is harmless.
 */
export function togglePin(teamSlug: string, officeSlug: string): boolean {
  if (!teamSlug || !officeSlug) return false
  try {
    const current = readRaw(teamSlug)
    const has = current.includes(officeSlug)
    const next = has
      ? current.filter((s) => s !== officeSlug)
      : [officeSlug, ...current]
    localStorage.setItem(keyFor(teamSlug), JSON.stringify(next))
    return !has
  } catch {
    return readRaw(teamSlug).includes(officeSlug)
  }
}

export function __clearPinsForTests(teamSlug?: string): void {
  try {
    if (teamSlug) {
      localStorage.removeItem(keyFor(teamSlug))
      return
    }
    // Clear every pin key (used by test setup that doesn't know
    // which team's pins it touched).
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(KEY_PREFIX)) localStorage.removeItem(k)
    }
  } catch {
    // noop
  }
}
