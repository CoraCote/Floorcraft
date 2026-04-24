import type { AnalyzerInput, Insight } from '../../types/insights'
import { isPrivateOfficeElement, isAssignableElement } from '../../types/elements'
import type { CanvasElement } from '../../types/elements'

/**
 * Accommodation analyzer — currently surfaces one rule, with headroom
 * for more as the accommodation catalogue expands:
 *
 *   wheelchair-access × narrow private office
 *   --------------------------------------------
 *   If an employee with a `wheelchair-access` accommodation is assigned
 *   to a `private-office` element whose `width < 120`, we warn that the
 *   cramped office is accessibility-hostile (ADA minimum door-side
 *   clearance is 60" / ~152 px; 120 is the generous lower bound where a
 *   wheelchair can still plausibly maneuver, but below that the office
 *   simply will not work).
 *
 * This is a deliberately narrow rule — the goal is to flag the obvious
 * "we assigned a wheelchair user to a broom closet" mistake, not to
 * substitute for a real route-analysis pass. A future iteration could
 * use door-graph distance or explicit `accessible=true` tagging on
 * elements; the rule shape here is stable either way.
 */
export function analyzeAccommodations(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []

  const elementsById = new Map<string, CanvasElement>()
  for (const el of input.elements) elementsById.set(el.id, el)

  for (const emp of input.employees) {
    if (!emp.accommodations || emp.accommodations.length === 0) continue
    if (!emp.seatId) continue

    const hasWheelchair = emp.accommodations.some(
      (a) => a.type === 'wheelchair-access',
    )
    if (!hasWheelchair) continue

    const seat = elementsById.get(emp.seatId)
    if (!seat || !isAssignableElement(seat)) continue

    // Only flag private-office assignments where the room is cramped.
    // Desks and workstations are out of scope for this rule — those
    // mismatches surface via CSA/ergonomic checks we don't run yet.
    if (!isPrivateOfficeElement(seat)) continue
    if (seat.width >= 120) continue

    insights.push({
      id: `accommodation-wheelchair-cramped-${emp.id}`,
      category: 'equipment',
      severity: 'warning',
      title: `${emp.name} needs accessible path`,
      narrative:
        `${emp.name} has a wheelchair-access accommodation but is assigned to a ` +
        `private office that is only ${seat.width}px wide — below the 120px ` +
        `threshold where a wheelchair can maneuver. Verify the route is ` +
        `accessible or reassign to a larger office.`,
      relatedElementIds: [seat.id],
      relatedEmployeeIds: [emp.id],
      actions: [
        { label: 'View details', type: 'highlight', payload: { employeeId: emp.id } },
      ],
      timestamp: Date.now(),
      dismissed: false,
    })
  }

  return insights
}
