import type { CanvasElement } from './elements'
import type { Employee } from './employee'

export type InsightCategory =
  | 'utilization'
  | 'proximity'
  | 'onboarding'
  | 'moves'
  | 'equipment'
  | 'trends'
  | 'sensitivity'
  // Neighborhood-level capacity signals (per-zone over/under-utilization).
  // Distinct from `utilization`, which covers the project-wide rollup and
  // zone-string-based analysis — this category is reserved for insights
  // tied to a named neighborhood.
  | 'capacity'

export type Severity = 'critical' | 'warning' | 'info'

export interface InsightAction {
  label: string
  type: 'navigate' | 'assign' | 'highlight' | 'external' | 'dismiss'
  payload: Record<string, unknown>
}

export interface Insight {
  id: string
  category: InsightCategory
  severity: Severity
  title: string
  narrative: string
  relatedElementIds: string[]
  relatedEmployeeIds: string[]
  actions: InsightAction[]
  timestamp: number
  dismissed: boolean
}

export interface AnalyzerInput {
  elements: CanvasElement[]
  employees: Employee[]
  zones: Map<string, CanvasElement[]>
}

export type Analyzer = (input: AnalyzerInput) => Insight[]
