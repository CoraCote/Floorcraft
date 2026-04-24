import type { Insight } from '../../types/insights'
import type { Neighborhood } from '../../types/neighborhood'
import type { CanvasElement } from '../../types/elements'
import type { Employee } from '../../types/employee'
import { computeNeighborhoodMetrics } from '../neighborhoodMetrics'

/**
 * Analyzer: per-neighborhood occupancy signal.
 *
 * Emits an insight when a neighborhood is meaningfully under- or
 * over-used. Thresholds are intentionally wider than the per-zone
 * `analyzeUtilization` rule so this analyzer only fires on genuine
 * outliers — neighborhood managers tend to resize and reshuffle their
 * pods, and we don't want to wake them up for a pod that happens to sit
 * at 60% today.
 *
 *   > 95% occupied  → `warning`, "near-capacity" narrative
 *   < 20% occupied  → `info`, "underused" narrative
 *   otherwise       → silent
 *
 * Category `'capacity'` sits alongside `'utilization'` in the filter
 * chips so facilities managers can toggle the neighborhood-level signal
 * independently of the project-wide utilization cards.
 *
 * Like `analyzeNeighborhoodDepartments`, this is a standalone analyzer
 * that takes the neighborhood list as an extra argument — neighborhoods
 * live in a sibling store, not the standard `AnalyzerInput`. Wired into
 * `runAllAnalyzers` via the overload in `analyzers/index.ts` so the
 * panel stays on a single call site.
 */
export function analyzeNeighborhoodUtilization(
  neighborhoods: Neighborhood[],
  elements: Record<string, CanvasElement>,
  employees: Record<string, Employee>,
): Insight[] {
  const insights: Insight[] = []
  const metrics = computeNeighborhoodMetrics(neighborhoods, elements, employees)

  for (const m of metrics) {
    // Skip neighborhoods without any seats — "Pod A has 0 seats"
    // isn't an occupancy insight, it's a shape/placement concern
    // that belongs to a different analyzer.
    if (m.totalSeats === 0) continue
    const pct = Math.round(m.occupancyRatio * 100)

    if (pct > 95) {
      insights.push({
        id: `neighborhood-capacity-over-${m.neighborhoodId}`,
        category: 'capacity',
        severity: 'warning',
        title: `${m.name} at ${pct}% occupancy`,
        narrative: `${m.name} is nearly full (${m.assignedSeats}/${m.totalSeats} seats assigned). Plan overflow or expand the zone before the next hire lands.`,
        relatedElementIds: m.elementIds,
        relatedEmployeeIds: [],
        actions: [
          {
            label: 'View on map',
            type: 'navigate',
            payload: { elementIds: m.elementIds },
          },
        ],
        timestamp: Date.now(),
        dismissed: false,
      })
      continue
    }

    if (pct < 20) {
      insights.push({
        id: `neighborhood-capacity-under-${m.neighborhoodId}`,
        category: 'capacity',
        severity: 'info',
        title: `${m.name} at ${pct}% occupancy`,
        narrative: `${m.name} is underused (${m.assignedSeats}/${m.totalSeats} seats assigned). Consider consolidating or reassigning the space.`,
        relatedElementIds: m.elementIds,
        relatedEmployeeIds: [],
        actions: [
          {
            label: 'View on map',
            type: 'navigate',
            payload: { elementIds: m.elementIds },
          },
        ],
        timestamp: Date.now(),
        dismissed: false,
      })
    }
  }

  return insights
}
