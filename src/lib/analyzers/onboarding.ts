import type { AnalyzerInput, Insight } from '../../types/insights'

export function analyzeOnboarding(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []
  const now = new Date()

  for (const emp of input.employees) {
    // New hires without seats
    if (emp.startDate && !emp.seatId) {
      const startDate = new Date(emp.startDate)
      if (startDate <= now) continue // already started, different issue

      const daysUntilStart = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      if (daysUntilStart <= 30) {
        const severity = daysUntilStart <= 7 ? 'critical' as const : 'warning' as const
        insights.push({
          id: `onboarding-no-seat-${emp.id}`,
          category: 'onboarding',
          severity,
          title: `${emp.name} starts in ${daysUntilStart} day${daysUntilStart === 1 ? '' : 's'} with no desk`,
          narrative: `${emp.name}${emp.department ? ` (${emp.department})` : ''} starts on ${startDate.toLocaleDateString()}. No desk has been assigned yet.${
            emp.equipmentStatus === 'pending' ? ' Equipment is also pending.' : ''
          }`,
          relatedElementIds: [],
          relatedEmployeeIds: [emp.id],
          actions: [
            { label: 'Auto-assign', type: 'assign', payload: { employeeId: emp.id } },
          ],
          timestamp: Date.now(),
          dismissed: false,
        })
      }
    }

    // Departed employees still occupying seats
    if (emp.endDate && emp.seatId) {
      const endDate = new Date(emp.endDate)
      if (endDate < now) {
        const daysSinceDeparture = Math.ceil((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24))
        insights.push({
          id: `onboarding-departed-${emp.id}`,
          category: 'onboarding',
          severity: 'info',
          title: `${emp.name} departed ${daysSinceDeparture} day${daysSinceDeparture === 1 ? '' : 's'} ago — seat still assigned`,
          narrative: `${emp.name} left on ${endDate.toLocaleDateString()} but is still assigned to seat ${emp.seatId}. Unassign to free the desk.`,
          relatedElementIds: [],
          relatedEmployeeIds: [emp.id],
          actions: [
            { label: 'Unassign', type: 'assign', payload: { employeeId: emp.id, action: 'unassign' } },
          ],
          timestamp: Date.now(),
          dismissed: false,
        })
      }
    }
  }

  return insights
}
