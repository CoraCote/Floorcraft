import type { CrossOfficeResult } from './crossOfficeSearch'

/**
 * Build the navigation target for a cross-office match. Employees go to
 * the destination office's roster with `?employee=<id>`; elements and
 * neighborhoods go to the map with `?focus=<id>` so the target view can
 * pan/zoom to the entity on mount (see `MapView`'s focus effect).
 * Selecting another office itself just navigates to its map.
 */
export function crossOfficeNavPath(
  teamSlug: string,
  result: CrossOfficeResult,
): string {
  const base = `/t/${teamSlug}/o/${result.officeSlug}`
  if (result.kind === 'employee') return `${base}/roster?employee=${result.id}`
  if (result.kind === 'office') return `${base}/map`
  return `${base}/map?focus=${result.id}`
}

/** Stable row key — mirrors what CrossOfficeResultsGroup uses for highlighting. */
export function crossOfficeRowKey(r: CrossOfficeResult): string {
  return `${r.officeId}:${r.kind}:${r.id}`
}
