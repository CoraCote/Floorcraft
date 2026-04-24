import type { AnalyzerInput, Insight } from '../../types/insights'
import type { SeatHistoryEntry } from '../../types/seatHistory'
import { useSeatHistoryStore } from '../../stores/seatHistoryStore'

/** A seat that triggers a churn warning has ≥3 reassigns in the last 30d. */
export const CHURN_REASSIGN_THRESHOLD = 3
export const CHURN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Analyzer factory — accepts an explicit `entries` source so tests can
 * supply a fixture without touching the Zustand store. Production callers
 * use `analyzeSeatChurn` below which reads the live store.
 */
export function analyzeSeatChurnFromEntries(
  input: AnalyzerInput,
  entries: SeatHistoryEntry[],
  now: number = Date.now(),
): Insight[] {
  const cutoff = now - CHURN_WINDOW_MS

  // Count reassigns per elementId within the window. `reassign` is
  // specifically the event we care about — a single assign-then-sit-still
  // isn't churn, and pure unassigns without a follow-up aren't either.
  const counts = new Map<string, number>()
  for (const entry of entries) {
    if (entry.action !== 'reassign') continue
    const ts = new Date(entry.timestamp).getTime()
    if (!Number.isFinite(ts) || ts < cutoff) continue
    counts.set(entry.elementId, (counts.get(entry.elementId) ?? 0) + 1)
  }

  const insights: Insight[] = []
  for (const [elementId, count] of counts) {
    if (count < CHURN_REASSIGN_THRESHOLD) continue
    const el = input.elements.find((e) => e.id === elementId)
    // Prefer the human deskId, fall back to the element's label, then
    // to a truncated id — the insight is worthless if the user can't
    // tell which seat is being called out.
    const elAny = el as { deskId?: string; label?: string } | undefined
    const seatLabel =
      (elAny?.deskId && elAny.deskId.length > 0 && elAny.deskId) ||
      (elAny?.label && elAny.label.length > 0 && elAny.label) ||
      elementId.slice(0, 6)
    insights.push({
      id: `seat-churn-${elementId}`,
      category: 'moves',
      severity: 'warning',
      title: `${seatLabel} reassigned ${count}× in 30d`,
      narrative: `${seatLabel} has had ${count} reassignments in the last 30 days. Consider dedicating it to one owner or converting to a hot-desk.`,
      relatedElementIds: [elementId],
      relatedEmployeeIds: [],
      actions: [
        { label: 'View history', type: 'navigate', payload: { seatId: elementId } },
      ],
      timestamp: now,
      dismissed: false,
    })
  }
  return insights
}

/**
 * Live-store entry-point used by the analyzer pipeline. Pulls the current
 * seat-history log and delegates to the pure helper so the logic itself
 * stays trivially testable.
 */
export function analyzeSeatChurn(input: AnalyzerInput): Insight[] {
  const entries = Object.values(useSeatHistoryStore.getState().entries)
  return analyzeSeatChurnFromEntries(input, entries)
}
