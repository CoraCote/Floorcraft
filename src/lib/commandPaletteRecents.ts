/**
 * Command-palette local persistence — recently invoked actions + scope.
 *
 * Two tiny localStorage slots, one for each of the palette's
 * personalisation knobs:
 *
 *   - `floocraft.commandPalette.recent`  → JSON string[] of action ids,
 *     newest-first, capped at `MAX_RECENT_COMMANDS`. The renderer shows
 *     these in a "Recent" ribbon at the top while the query is empty.
 *   - `floocraft.commandPalette.scope`   → `'office' | 'all'`. Toggled by
 *     the small chip beneath the input. Persists across sessions so a
 *     user who lives in cross-office search doesn't have to reconfigure
 *     the palette every time.
 *
 * The module deliberately stays free of React imports so it can be unit
 * tested as plain functions, and so it survives an SSR pass on the
 * marketing pages where `localStorage` is undefined. Every read/write
 * goes through a try/catch + window guard — quota errors, private mode,
 * or a missing `window` (Node tests, server) all collapse to the safe
 * fallback (empty list / `'office'` scope) rather than crashing the
 * palette.
 */

/** Storage key for the recent-action ring. Mirrors the `floocraft.*` prefix
 *  the rest of the app uses (see `filterPresetsStorage`, `useLibraryFavorites`). */
export const RECENTS_STORAGE_KEY = 'floocraft.commandPalette.recent'

/** Storage key for the scope toggle. Same prefix convention. */
export const SCOPE_STORAGE_KEY = 'floocraft.commandPalette.scope'

/** Cap on the recents ribbon — five rows is enough to cover yesterday's
 *  workflow without pushing groups below the fold. */
export const MAX_RECENT_COMMANDS = 5

/** Search scope — narrows the palette to the current office or expands to
 *  every office the team can see. */
export type CommandPaletteScope = 'office' | 'all'

/** Default scope when nothing is persisted. We start broad ("All offices")
 *  so the palette behaves the same as before the toggle existed — typing
 *  a query still surfaces cross-office matches by default. Users who want
 *  to narrow can flip the chip and the choice persists across sessions. */
export const DEFAULT_SCOPE: CommandPaletteScope = 'all'

/** True iff `localStorage` is reachable. Wrapped in a try because some
 *  embedded WebViews throw on the property access itself. */
function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
  } catch {
    return false
  }
}

/**
 * Read the recents ring. Returns `[]` whenever the slot is missing,
 * unparseable, or shaped wrong — callers can safely treat the empty array
 * as "nothing to show" without their own try/catch.
 */
export function getRecents(): string[] {
  if (!hasStorage()) return []
  let raw: string | null
  try {
    raw = window.localStorage.getItem(RECENTS_STORAGE_KEY)
  } catch {
    return []
  }
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Wipe the garbage so subsequent reads are cheap. Swallow secondary
    // errors — if removeItem itself throws, we'll just keep returning [].
    try { window.localStorage.removeItem(RECENTS_STORAGE_KEY) } catch { /* ignore */ }
    return []
  }
  if (!Array.isArray(parsed)) return []
  // Filter to strings only — keeps the renderer from blowing up if the
  // shape ever changes on a future cap, and matches the public type.
  return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT_COMMANDS)
}

/**
 * Push `id` to the front of the recents ring. Existing occurrences move
 * (dedupe-then-prepend), and the list is capped at `MAX_RECENT_COMMANDS`
 * so the slot can't grow unbounded.
 *
 * Returns the new list so callers don't have to round-trip through
 * `getRecents()` — handy for tests and for any caller that wants to
 * update an in-memory copy alongside the persisted one.
 */
export function addRecent(id: string): string[] {
  const current = getRecents()
  // Move-to-front: drop any prior occurrence, then prepend the new id.
  const next = [id, ...current.filter((existing) => existing !== id)].slice(
    0,
    MAX_RECENT_COMMANDS,
  )
  if (!hasStorage()) return next
  try {
    window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota / disabled storage — degrade silently. The in-memory result
    // is still correct for the current session.
  }
  return next
}

/** Test seam: blow the recents slot away. Not exported via the React
 *  surface — only used by the helper's own unit tests. */
export function __clearRecentsForTests(): void {
  if (!hasStorage()) return
  try { window.localStorage.removeItem(RECENTS_STORAGE_KEY) } catch { /* ignore */ }
}

/** Type guard for the persisted scope literal. Anything else collapses
 *  to the default — e.g. a future scope value rolled out and then back
 *  shouldn't permanently brick a returning user's palette. */
function isScope(v: unknown): v is CommandPaletteScope {
  return v === 'office' || v === 'all'
}

/**
 * Read the persisted scope choice. Returns `DEFAULT_SCOPE` when the slot
 * is missing or carries an unknown value.
 */
export function getScope(): CommandPaletteScope {
  if (!hasStorage()) return DEFAULT_SCOPE
  let raw: string | null
  try {
    raw = window.localStorage.getItem(SCOPE_STORAGE_KEY)
  } catch {
    return DEFAULT_SCOPE
  }
  if (raw === null) return DEFAULT_SCOPE
  return isScope(raw) ? raw : DEFAULT_SCOPE
}

/**
 * Persist the scope choice. Silently no-ops when storage is unavailable;
 * the caller's in-memory state still reflects the new value, which is
 * good enough for the active session.
 */
export function setScope(scope: CommandPaletteScope): void {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(SCOPE_STORAGE_KEY, scope)
  } catch {
    // Same rationale as addRecent — degrade silently.
  }
}
