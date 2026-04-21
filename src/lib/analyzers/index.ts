import type { CanvasElement } from '../../types/elements'
import type { Employee } from '../../types/employee'
import type { AnalyzerInput, Insight } from '../../types/insights'
import { analyzeUtilization } from './utilization'
import { analyzeTeamProximity } from './proximity'
import { analyzeOnboarding } from './onboarding'
import { analyzeMoves } from './moves'
import { analyzeEquipment } from './equipment'
import { analyzeTrends } from './trends'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

export function buildAnalyzerInput(
  elements: CanvasElement[],
  employees: Employee[],
): AnalyzerInput {
  const zones = new Map<string, CanvasElement[]>()

  for (const el of elements) {
    if (el.zone) {
      if (!zones.has(el.zone)) zones.set(el.zone, [])
      zones.get(el.zone)!.push(el)
    }
  }

  return { elements, employees, zones }
}

export function runAllAnalyzers(
  elements: CanvasElement[],
  employees: Employee[],
): Insight[] {
  const input = buildAnalyzerInput(elements, employees)

  const allInsights = [
    ...analyzeUtilization(input),
    ...analyzeTeamProximity(input),
    ...analyzeOnboarding(input),
    ...analyzeMoves(input),
    ...analyzeEquipment(input),
    ...analyzeTrends(input),
  ]

  // Deduplicate by id (keep first occurrence)
  const seen = new Set<string>()
  const unique: Insight[] = []
  for (const insight of allInsights) {
    if (!seen.has(insight.id)) {
      seen.add(insight.id)
      unique.push(insight)
    }
  }

  // Sort by severity (critical first)
  unique.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return unique
}
