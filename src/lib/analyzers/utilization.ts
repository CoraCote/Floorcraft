import type { AnalyzerInput, Insight } from '../../types/insights'
import { isAssignableElement } from '../../types/elements'
import type { DeskElement, WorkstationElement, PrivateOfficeElement } from '../../types/elements'

function getAssignedCount(el: DeskElement | WorkstationElement | PrivateOfficeElement): number {
  if (el.type === 'desk' || el.type === 'hot-desk') {
    return el.assignedEmployeeId ? 1 : 0
  }
  if (el.type === 'workstation') {
    return el.assignedEmployeeIds.length
  }
  if (el.type === 'private-office') {
    return el.assignedEmployeeIds.length
  }
  return 0
}

function getCapacity(el: DeskElement | WorkstationElement | PrivateOfficeElement): number {
  if (el.type === 'desk' || el.type === 'hot-desk') return 1
  if (el.type === 'workstation') return el.positions
  if (el.type === 'private-office') return el.capacity
  return 0
}

export function analyzeUtilization(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []
  const assignable = input.elements.filter(isAssignableElement)

  if (assignable.length === 0) return []

  // Per-zone analysis
  for (const [zoneName, zoneElements] of input.zones) {
    const zoneAssignable = zoneElements.filter(isAssignableElement)
    if (zoneAssignable.length === 0) continue

    const totalCapacity = zoneAssignable.reduce((sum, el) => sum + getCapacity(el), 0)
    const totalAssigned = zoneAssignable.reduce((sum, el) => sum + getAssignedCount(el), 0)
    const utilization = totalCapacity > 0 ? totalAssigned / totalCapacity : 0
    const pct = Math.round(utilization * 100)
    const unassignedCount = totalCapacity - totalAssigned

    let severity: 'critical' | 'warning' | 'info'
    if (pct < 20 || pct > 95) {
      severity = 'critical'
    } else if (pct < 40 || pct > 85) {
      severity = 'warning'
    } else {
      severity = 'info'
    }

    if (severity !== 'info' || unassignedCount > 0) {
      insights.push({
        id: `utilization-zone-${zoneName}`,
        category: 'utilization',
        severity,
        title: `${zoneName} at ${pct}% utilization`,
        narrative: `${zoneName} has ${totalCapacity} seats with ${totalAssigned} assigned (${unassignedCount} open). ${
          pct < 40
            ? 'Consider consolidating to free up this zone.'
            : pct > 85
              ? 'This zone is nearly full — plan for overflow.'
              : ''
        }`.trim(),
        relatedElementIds: zoneAssignable.map((el) => el.id),
        relatedEmployeeIds: [],
        actions: [
          { label: 'View on map', type: 'navigate', payload: { elementIds: zoneAssignable.map((el) => el.id) } },
        ],
        timestamp: Date.now(),
        dismissed: false,
      })
    }
  }

  // Overall summary for unzoned elements
  const unzoned = assignable.filter((el) => !el.zone)
  if (unzoned.length > 0) {
    const totalCapacity = unzoned.reduce((sum, el) => sum + getCapacity(el as DeskElement | WorkstationElement | PrivateOfficeElement), 0)
    const totalAssigned = unzoned.reduce((sum, el) => sum + getAssignedCount(el as DeskElement | WorkstationElement | PrivateOfficeElement), 0)
    const unassignedCount = totalCapacity - totalAssigned

    if (unassignedCount > 0) {
      insights.push({
        id: 'utilization-unzoned',
        category: 'utilization',
        severity: 'info',
        title: `${unassignedCount} unzoned seat${unassignedCount === 1 ? '' : 's'} available`,
        narrative: `${unassignedCount} of ${totalCapacity} seats without a zone assignment are open. Consider assigning zones for better space tracking.`,
        relatedElementIds: unzoned.map((el) => el.id),
        relatedEmployeeIds: [],
        actions: [
          { label: 'View on map', type: 'navigate', payload: { elementIds: unzoned.map((el) => el.id) } },
        ],
        timestamp: Date.now(),
        dismissed: false,
      })
    }
  }

  return insights
}
