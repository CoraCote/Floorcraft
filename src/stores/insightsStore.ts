import { create } from 'zustand'
import type { Insight, InsightCategory, Severity } from '../types/insights'
import { runAllAnalyzers, buildAnalyzerInput } from '../lib/analyzers'
import { analyzeNeighborhoodDepartments } from '../lib/analyzers/neighborhoods'
import type { CanvasElement } from '../types/elements'
import type { Employee } from '../types/employee'
import type { Neighborhood } from '../types/neighborhood'

interface InsightsState {
  insights: Insight[]
  dismissedIds: Set<string>
  currentProjectId: string | null
  filter: {
    categories: Set<InsightCategory>
    severities: Set<Severity>
    showDismissed: boolean
  }
  lastAnalyzedAt: number | null
  isAnalyzing: boolean

  // Actions
  runAnalysis: (
    elements: CanvasElement[],
    employees: Employee[],
    neighborhoods?: Neighborhood[],
  ) => void
  dismissInsight: (id: string) => void
  restoreInsight: (id: string) => void
  setCurrentProjectId: (id: string | null) => void
  toggleCategory: (category: InsightCategory) => void
  toggleSeverity: (severity: Severity) => void
  setShowDismissed: (show: boolean) => void

  // Computed
  getFilteredInsights: () => Insight[]
  getCounts: () => { critical: number; warning: number; info: number; total: number }
}

const ALL_CATEGORIES: InsightCategory[] = ['utilization', 'proximity', 'onboarding', 'moves', 'equipment', 'trends']
const ALL_SEVERITIES: Severity[] = ['critical', 'warning', 'info']

function loadDismissedIds(projectId?: string): Set<string> {
  try {
    const key = `floocraft-dismissed-${projectId || 'default'}`
    const stored = localStorage.getItem(key)
    if (stored) return new Set(JSON.parse(stored))
  } catch {
    // ignore
  }
  return new Set()
}

function saveDismissedIds(ids: Set<string>, projectId?: string) {
  try {
    const key = `floocraft-dismissed-${projectId || 'default'}`
    localStorage.setItem(key, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

export const useInsightsStore = create<InsightsState>((set, get) => ({
  insights: [],
  dismissedIds: loadDismissedIds(),
  currentProjectId: null,
  filter: {
    categories: new Set(ALL_CATEGORIES),
    severities: new Set(ALL_SEVERITIES),
    showDismissed: false,
  },
  lastAnalyzedAt: null,
  isAnalyzing: false,

  runAnalysis: (elements, employees, neighborhoods) => {
    set({ isAnalyzing: true })
    const raw = runAllAnalyzers(elements, employees)
    // Append the neighborhood-department analyzer if a caller threaded
    // neighborhoods through. The pipeline itself doesn't know about
    // neighborhoods (they live in a sibling store); we run this check
    // here and merge its output into the same insights array so the
    // panel renders one unified list.
    if (neighborhoods && neighborhoods.length > 0) {
      const employeeById = new Map(
        employees.map((e) => [e.id, { department: e.department }] as const),
      )
      const input = buildAnalyzerInput(elements, employees)
      const nbInsights = analyzeNeighborhoodDepartments(
        input,
        neighborhoods,
        employeeById,
      )
      raw.push(...nbInsights)
    }
    const dismissed = get().dismissedIds
    const insights = raw.map((insight) => ({
      ...insight,
      dismissed: dismissed.has(insight.id),
    }))
    set({ insights, lastAnalyzedAt: Date.now(), isAnalyzing: false })
  },

  dismissInsight: (id) => {
    set((state) => {
      const next = new Set(state.dismissedIds)
      next.add(id)
      saveDismissedIds(next, state.currentProjectId ?? 'default')
      return {
        dismissedIds: next,
        insights: state.insights.map((i) =>
          i.id === id ? { ...i, dismissed: true } : i
        ),
      }
    })
  },

  restoreInsight: (id) => {
    set((state) => {
      const next = new Set(state.dismissedIds)
      next.delete(id)
      saveDismissedIds(next, state.currentProjectId ?? 'default')
      return {
        dismissedIds: next,
        insights: state.insights.map((i) =>
          i.id === id ? { ...i, dismissed: false } : i
        ),
      }
    })
  },

  setCurrentProjectId: (id) => {
    // Swapping projects → re-hydrate dismissals from the new project's
    // localStorage bucket so prior project's dismissed insights don't bleed
    // into this one. Insights are re-marked on the next runAnalysis call.
    if (id === null) {
      set({ currentProjectId: null })
      return
    }
    const dismissed = loadDismissedIds(id)
    set((state) => ({
      currentProjectId: id,
      dismissedIds: dismissed,
      // Refresh the `dismissed` flag on existing insights against the new set.
      insights: state.insights.map((i) => ({ ...i, dismissed: dismissed.has(i.id) })),
    }))
  },

  toggleCategory: (category) => {
    set((state) => {
      const next = new Set(state.filter.categories)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return { filter: { ...state.filter, categories: next } }
    })
  },

  toggleSeverity: (severity) => {
    set((state) => {
      const next = new Set(state.filter.severities)
      if (next.has(severity)) {
        next.delete(severity)
      } else {
        next.add(severity)
      }
      return { filter: { ...state.filter, severities: next } }
    })
  },

  setShowDismissed: (show) => {
    set((state) => ({ filter: { ...state.filter, showDismissed: show } }))
  },

  getFilteredInsights: () => {
    const state = get()
    return state.insights.filter((insight) => {
      if (!state.filter.categories.has(insight.category)) return false
      if (!state.filter.severities.has(insight.severity)) return false
      if (insight.dismissed && !state.filter.showDismissed) return false
      return true
    })
  },

  getCounts: () => {
    const state = get()
    const active = state.insights.filter((i) => !i.dismissed)
    return {
      critical: active.filter((i) => i.severity === 'critical').length,
      warning: active.filter((i) => i.severity === 'warning').length,
      info: active.filter((i) => i.severity === 'info').length,
      total: active.length,
    }
  },
}))
