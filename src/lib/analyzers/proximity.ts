import type { AnalyzerInput, Insight } from '../../types/insights'
import { isDeskElement, isWorkstationElement, isPrivateOfficeElement } from '../../types/elements'
import type { CanvasElement } from '../../types/elements'

function getEmployeeZone(
  employeeSeatId: string | null,
  elements: CanvasElement[],
): string | null {
  if (!employeeSeatId) return null
  for (const el of elements) {
    if (isDeskElement(el) && el.deskId === employeeSeatId) return el.zone || null
    if (isWorkstationElement(el) && el.deskId === employeeSeatId) return el.zone || null
    if (isPrivateOfficeElement(el) && el.deskId === employeeSeatId) return el.zone || null
  }
  return null
}

export function analyzeTeamProximity(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []

  // Group employees by department
  const deptMap = new Map<string, { employeeId: string; zone: string | null }[]>()
  for (const emp of input.employees) {
    if (!emp.department) continue
    if (!deptMap.has(emp.department)) deptMap.set(emp.department, [])
    const zone = getEmployeeZone(emp.seatId, input.elements)
    deptMap.get(emp.department)!.push({ employeeId: emp.id, zone })
  }

  for (const [dept, members] of deptMap) {
    const seatedMembers = members.filter((m) => m.zone !== null)
    if (seatedMembers.length < 2) continue

    // Count per zone
    const zoneCounts = new Map<string, string[]>()
    for (const m of seatedMembers) {
      const z = m.zone!
      if (!zoneCounts.has(z)) zoneCounts.set(z, [])
      zoneCounts.get(z)!.push(m.employeeId)
    }

    if (zoneCounts.size < 2) continue

    const zoneBreakdown = [...zoneCounts.entries()]
      .map(([z, ids]) => `${ids.length} in ${z}`)
      .join(', ')

    insights.push({
      id: `proximity-dept-${dept}`,
      category: 'proximity',
      severity: 'warning',
      title: `${dept} split across ${zoneCounts.size} zones`,
      narrative: `${dept} team is spread across multiple zones: ${zoneBreakdown}. Co-locating could improve collaboration.`,
      relatedElementIds: seatedMembers.map((m) => m.employeeId),
      relatedEmployeeIds: members.map((m) => m.employeeId),
      actions: [
        { label: 'Highlight team', type: 'highlight', payload: { employeeIds: members.map((m) => m.employeeId) } },
      ],
      timestamp: Date.now(),
      dismissed: false,
    })
  }

  return insights
}
