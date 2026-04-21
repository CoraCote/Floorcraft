import type { CanvasElement } from './elements'
import type { Employee } from './employee'

export type InsightCategory =
  | 'utilization'
  | 'proximity'
  | 'onboarding'
  | 'moves'
  | 'equipment'
  | 'trends'

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
