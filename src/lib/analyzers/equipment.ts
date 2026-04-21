import type { AnalyzerInput, Insight } from '../../types/insights'

export function analyzeEquipment(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []

  const pendingEmployees = input.employees.filter(
    (emp) => emp.equipmentStatus === 'pending' && emp.equipmentNeeds.length > 0
  )

  if (pendingEmployees.length === 0) return []

  for (const emp of pendingEmployees) {
    const isSeated = emp.seatId !== null
    insights.push({
      id: `equipment-pending-${emp.id}`,
      category: 'equipment',
      severity: isSeated ? 'warning' : 'info',
      title: `${emp.name} needs ${emp.equipmentNeeds.length} item${emp.equipmentNeeds.length === 1 ? '' : 's'}`,
      narrative: `${emp.name} has pending equipment: ${emp.equipmentNeeds.join(', ')}.${
        isSeated ? ` They are seated at ${emp.seatId} — provision soon.` : ' Assign a desk first, then provision.'
      }`,
      relatedElementIds: [],
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
