import { createOffice, saveOffice } from '../offices/officeRepository'
import { buildDemoOfficePayload } from './createDemoOffice'

/**
 * The exact name we give a freshly-seeded sample office. Used both as
 * the create-time argument and as the marker the in-editor callout
 * checks against. Keep this single source of truth — if it drifts, the
 * callout silently stops appearing.
 *
 * The em-dash + lowercase suffix is intentional copy: "Sample office —
 * try editing me" reads as instruction, which is what we want a
 * first-time visitor's eye to land on.
 */
export const SAMPLE_OFFICE_NAME = 'Sample office — try editing me'

/**
 * Best-effort: create one populated sample office in the freshly-created
 * team so the team-home page is never empty. The first sight a new
 * operator gets after team-creation is a card they can click into rather
 * than an "Empty office: + New office" stub.
 *
 * Failures here are logged and swallowed by design. If the office can't
 * be created (transient network, RLS race, anything), the user still
 * lands on a working team-home — they just see the empty state, which
 * is the same surface that existed before this seeding step.
 *
 * The seed payload is `buildDemoOfficePayload()` — the same content
 * powering `/demo` and the in-editor "Load sample content" action — so
 * the sample office shows the curated multi-floor demo, not a stub.
 */
export async function seedSampleOffice(teamId: string): Promise<void> {
  try {
    const office = await createOffice(teamId, SAMPLE_OFFICE_NAME)
    const payload = buildDemoOfficePayload()
    const res = await saveOffice(
      office.id,
      payload as unknown as Record<string, unknown>,
      office.updated_at,
    )
    if (!res.ok) {
      console.warn('[sample-office] initial seed save failed', res)
    }
  } catch (err) {
    console.warn('[sample-office] seed failed', err)
  }
}

/**
 * Predicate the in-editor callout uses to decide whether a loaded
 * office is the sample. Compares against the seeded name verbatim — if
 * the operator renames the office, the callout naturally disappears,
 * which is the right behavior (a renamed office means engagement; the
 * banner has done its job).
 */
export function isSampleOffice(name: string | null | undefined): boolean {
  return name === SAMPLE_OFFICE_NAME
}
