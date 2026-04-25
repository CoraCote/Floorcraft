/**
 * LocalStorage-backed MRU list of recently-opened office slugs.
 *
 * Used by the TeamHomePage "Recent" row so a returning user can jump
 * back into whatever they were editing yesterday without re-scanning
 * the full office grid. The storage key intentionally uses the
 * `floocraft.` prefix — past waves confirmed this is the shipping
 * namespace (not `floorcraft.`).
 *
 * Contract:
 *   - `addRecent(slug)` moves `slug` to the head of the list and
 *     caps the list at `MAX` entries. A second call with the same
 *     slug is a no-op reorder (dedupe), not an append.
 *   - `getRecents()` returns the current list head-first. Malformed
 *     JSON (someone tampered with localStorage, a legacy shape
 *     survived a migration, the storage API threw) resolves to `[]`
 *     rather than propagating — the "recent" surface is purely
 *     decorative and the page still renders the full office grid.
 *
 * Not a zustand store: nothing else in the app cares about the list
 * reactively. TeamHomePage reads once at mount and writes when the
 * user opens an office from the card grid (wired at the card-click
 * site in subsequent waves, or today via a manual `addRecent` call
 * when navigation happens).
 */

const KEY = 'floocraft.recentOffices'
const MAX = 5

/** Safe-parse the stored array. Any failure collapses to []. */
function readRaw(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Defensive: drop anything that isn't a non-empty string. Cheap
    // filter compared to letting stale / corrupted entries flow to
    // the UI and blow up the slug lookup.
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}

/**
 * Return recent slugs, head-first (most-recently-opened first).
 * Always returns a fresh array so callers can mutate it without
 * worrying about aliasing the persisted copy.
 */
export function getRecents(): string[] {
  return readRaw().slice(0, MAX)
}

/**
 * Insert `slug` at the head of the recent list, removing any prior
 * occurrence (dedupe) and capping the list at MAX. Silently no-ops
 * on storage failures — recent-tracking is best-effort.
 */
export function addRecent(slug: string): void {
  if (typeof slug !== 'string' || slug.length === 0) return
  try {
    const current = readRaw()
    const next = [slug, ...current.filter((s) => s !== slug)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // swallow — best-effort
  }
}

/** Test-only: clear the stored list. Not exported for production use. */
export function __clearRecentsForTests(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // noop
  }
}
