/**
 * Saved roster filter presets — localStorage persistence.
 *
 * Presets are per-device, not per-user / per-team. We deliberately avoid
 * a Supabase table: presets are a personal convenience (my own "on-leave
 * + engineering" shortcut), they carry no team-wide truth, and anything
 * that smuggled its way into the URL query is already shareable through
 * a plain link. Keeping them local also means we don't need migrations
 * or RLS for what amounts to a dropdown of bookmarks.
 *
 * The storage surface is intentionally tiny:
 *   - load / save  : full-array round-trip, with defensive parsing so a
 *     corrupt slot can't wedge the Roster page on boot.
 *   - add          : purges the oldest (by createdAt) when the cap is
 *     hit, returning the purged item so the UI can toast.
 *   - delete/rename: straight list transforms.
 *   - resolveUniquePresetName: duplicate names are allowed (per spec) but
 *     we append "(2)", "(3)"… so ids stay unique and the dropdown doesn't
 *     render two identical labels.
 */

export interface FilterPreset {
  id: string
  name: string
  /** URLSearchParams.toString() output — e.g. "q=ali&dept=Eng". */
  query: string
  /** ISO 8601. Used to determine the oldest entry for purge. */
  createdAt: string
}

export const FILTER_PRESETS_STORAGE_KEY = 'floocraft.rosterFilterPresets'

/**
 * 20 is plenty for a personal shortcut list and small enough that the
 * dropdown stays scannable. Keeping the cap low also bounds the worst
 * case localStorage payload — each preset is a handful of bytes, but
 * nothing stops a user from pasting a 2kb query string into the URL.
 */
export const MAX_FILTER_PRESETS = 20

function isFilterPreset(v: unknown): v is FilterPreset {
  if (v === null || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.query === 'string' &&
    typeof r.createdAt === 'string'
  )
}

/**
 * Read presets. Returns [] for any non-happy-path so callers can treat
 * "no presets" as the stable fallback without a try/catch of their own.
 * On corrupt JSON we also reset the slot: the roster page mounts this
 * on every visit and we'd rather not log the same parse error forever.
 */
export function loadFilterPresets(): FilterPreset[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(FILTER_PRESETS_STORAGE_KEY)
  } catch {
    return []
  }
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Wipe the garbage so subsequent reads are cheap.
    try { localStorage.removeItem(FILTER_PRESETS_STORAGE_KEY) } catch { /* ignore */ }
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isFilterPreset)
}

export function saveFilterPresets(presets: FilterPreset[]): void {
  try {
    localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // Quota / private-mode / disabled storage — silently degrade rather
    // than crashing the roster. Callers' in-memory state is still correct;
    // only the persistence step was lost.
  }
}

/**
 * Append `preset`, purging the oldest by `createdAt` if that would
 * exceed `MAX_FILTER_PRESETS`. Returns both the new list and the purged
 * entry (or null) so the UI can surface a toast when it happens.
 */
export function addFilterPreset(
  existing: FilterPreset[],
  preset: FilterPreset,
): { presets: FilterPreset[]; purged: FilterPreset | null } {
  const next = [...existing, preset]
  if (next.length <= MAX_FILTER_PRESETS) {
    return { presets: next, purged: null }
  }
  // Find the oldest (smallest createdAt). Ties (same ms) resolve to
  // whichever appears first in the array — order in the array is our
  // insertion order, so the "first" one is genuinely older by FIFO.
  let oldestIdx = 0
  for (let i = 1; i < next.length; i++) {
    if (next[i].createdAt < next[oldestIdx].createdAt) oldestIdx = i
  }
  const purged = next[oldestIdx]
  const presets = next.filter((_, i) => i !== oldestIdx)
  return { presets, purged }
}

export function deleteFilterPreset(
  existing: FilterPreset[],
  id: string,
): FilterPreset[] {
  return existing.filter((p) => p.id !== id)
}

export function renameFilterPreset(
  existing: FilterPreset[],
  id: string,
  name: string,
): FilterPreset[] {
  return existing.map((p) => (p.id === id ? { ...p, name } : p))
}

/**
 * Disambiguate a user-supplied name against the current list. Saves are
 * allowed to re-use a name (users think in labels, not ids), but the
 * dropdown would become useless if two entries read identically, so we
 * append the smallest "(N)" suffix that doesn't collide. N starts at 2
 * to match the informal convention people use when numbering copies.
 */
export function resolveUniquePresetName(
  existing: FilterPreset[],
  desired: string,
): string {
  const taken = new Set(existing.map((p) => p.name))
  if (!taken.has(desired)) return desired
  for (let n = 2; n < 1000; n++) {
    const candidate = `${desired} (${n})`
    if (!taken.has(candidate)) return candidate
  }
  // Pathological fallback — 998 collisions means something is very
  // wrong. Stamp with a timestamp rather than looping forever.
  return `${desired} (${Date.now()})`
}
