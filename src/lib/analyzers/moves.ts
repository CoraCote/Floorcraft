import type { AnalyzerInput, Insight } from '../../types/insights'

export function analyzeMoves(input: AnalyzerInput): Insight[] {
  const insights: Insight[] = []

  const pendingMoves = input.employees.filter((emp) =>
    emp.tags.includes('pending-move')
  )

  if (pendingMoves.length === 0) return []

  for (const emp of pendingMoves) {
    insights.push({
      id: `moves-pending-${emp.id}`,
      category: 'moves',
      severity: 'info',
      title: `${emp.name} has a pending move`,
      narrative: `${emp.name}${emp.department ? ` (${emp.department})` : ''} is tagged for relocation.${
        emp.seatId ? ` Currently at ${emp.seatId}.` : ' Not currently assigned a desk.'
      }`,
      relatedElementIds: [],
      relatedEmployeeIds: [emp.id],
      actions: [
        { label: 'View on map', type: 'navigate', payload: { employeeId: emp.id } },
      ],
      timestamp: Date.now(),
      dismissed: false,
    })
  }

  // Aggregate if multiple moves
  if (pendingMoves.length > 1) {
    insights.push({
      id: 'moves-aggregate',
      category: 'moves',
      severity: 'warning',
      title: `${pendingMoves.length} pending moves to coordinate`,
      narrative: `${pendingMoves.map((e) => e.name).join(', ')} are all tagged for relocation. Consider batching these moves.`,
      relatedElementIds: [],
      relatedEmployeeIds: pendingMoves.map((e) => e.id),
      actions: [
        { label: 'Highlight all', type: 'highlight', payload: { employeeIds: pendingMoves.map((e) => e.id) } },
      ],
      timestamp: Date.now(),
      dismissed: false,
    })
  }

  return insights
}
