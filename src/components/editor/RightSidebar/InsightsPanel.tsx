import { useEffect, useCallback, useRef, useMemo } from 'react'
import { RefreshCw, CheckCircle } from 'lucide-react'
import { useInsightsStore } from '../../../stores/insightsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useAllFloorElements } from '../../../hooks/useActiveFloorElements'
import type { CanvasElement } from '../../../types/elements'
import type { Insight, InsightAction } from '../../../types/insights'
import { useShallow } from 'zustand/react/shallow'
import { SeveritySummary } from './SeveritySummary'
import { InsightFilters } from './InsightFilters'
import { InsightCard } from './InsightCard'
import { UtilizationWidgets } from './UtilizationWidgets'
import { focusElements } from '../../../lib/focusElements'

export function InsightsPanel() {
  const floorsWithElements = useAllFloorElements()
  // TODO: analyzers currently do not distinguish elements by floor — merge
  // every floor's elements into a single map so the panel reflects the whole
  // project, not just the active floor. If analyzers ever need floor context,
  // extend runAllAnalyzers to take the full floorsWithElements array.
  const elements = useMemo(
    () =>
      floorsWithElements.reduce(
        (acc, f) => Object.assign(acc, f.elements),
        {} as Record<string, CanvasElement>
      ),
    [floorsWithElements]
  )
  const employees = useEmployeeStore((s) => s.employees)

  const {
    lastAnalyzedAt,
    isAnalyzing,
    runAnalysis,
    dismissInsight,
    restoreInsight,
    toggleCategory,
    toggleSeverity,
    filter,
  } = useInsightsStore(
    useShallow((s) => ({
      lastAnalyzedAt: s.lastAnalyzedAt,
      isAnalyzing: s.isAnalyzing,
      runAnalysis: s.runAnalysis,
      dismissInsight: s.dismissInsight,
      restoreInsight: s.restoreInsight,
      toggleCategory: s.toggleCategory,
      toggleSeverity: s.toggleSeverity,
      filter: s.filter,
    }))
  )

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerAnalysis = useCallback(() => {
    const elementsList = Object.values(elements)
    const employeesList = Object.values(employees)
    runAnalysis(elementsList, employeesList)
  }, [elements, employees, runAnalysis])

  // Debounced reactive analysis
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(triggerAnalysis, 500)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [triggerAnalysis])

  // Subscribe to raw state
  const insights = useInsightsStore((s) => s.insights)

  // Derive filtered insights
  const filtered = useMemo(() => {
    return insights.filter((insight) => {
      if (!filter.categories.has(insight.category)) return false
      if (!filter.severities.has(insight.severity)) return false
      if (insight.dismissed && !filter.showDismissed) return false
      return true
    })
  }, [insights, filter.categories, filter.severities, filter.showDismissed])

  // Derive dismissed list
  const dismissed = useMemo(
    () => insights.filter((i) => i.dismissed),
    [insights]
  )

  // Derive counts
  const counts = useMemo(() => {
    let critical = 0
    let warning = 0
    let info = 0
    for (const i of insights) {
      if (i.dismissed) continue
      if (i.severity === 'critical') critical++
      else if (i.severity === 'warning') warning++
      else if (i.severity === 'info') info++
    }
    return { critical, warning, info }
  }, [insights])

  // Clicking the card body selects the related elements and pans the
  // canvas to them. For "highlight" / "navigate" action buttons we do
  // exactly the same thing — the visual outcome the user wants is the
  // same ("show me what this is about"). "dismiss" routes through the
  // dismiss store action, and everything else is a no-op for now.
  const handleCardClick = useCallback((insight: Insight) => {
    focusElements(insight.relatedElementIds)
  }, [])

  const handleAction = useCallback(
    (insightId: string, actionIndex: number) => {
      const insight = useInsightsStore.getState().insights.find((i) => i.id === insightId)
      if (!insight) return
      const action: InsightAction | undefined = insight.actions[actionIndex]
      if (!action) return
      switch (action.type) {
        case 'navigate':
        case 'highlight':
        case 'assign': {
          // All three visually converge on "put the user in front of
          // these elements so they can act on them." More targeted
          // flows (e.g. opening an assignment drawer for `assign`) are
          // future work; focusing already unblocks the user.
          focusElements(insight.relatedElementIds)
          return
        }
        case 'dismiss':
          dismissInsight(insightId)
          return
        case 'external': {
          const url = typeof action.payload.url === 'string' ? action.payload.url : null
          if (url) window.open(url, '_blank', 'noopener,noreferrer')
          return
        }
      }
    },
    [dismissInsight],
  )

  const lastAnalyzedLabel = useMemo(
    () =>
      lastAnalyzedAt
        ? new Date(lastAnalyzedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'never',
    [lastAnalyzedAt]
  )

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Utilization KPIs — the "is this office healthy?" scan facilities
          asked for. Sits above the severity summary because "are we sized
          right?" is a bigger question than "any issues to fix?". */}
      <UtilizationWidgets />

      {/* Severity summary */}
      <SeveritySummary
        critical={counts.critical}
        warning={counts.warning}
        info={counts.info}
      />

      {/* Filters */}
      <InsightFilters
        activeCategories={filter.categories}
        activeSeverities={filter.severities}
        onToggleCategory={toggleCategory}
        onToggleSeverity={toggleSeverity}
      />

      {/* Insight cards */}
      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle size={32} className="text-green-400 mb-3" />
            <p className="text-sm font-medium text-gray-600">All clear</p>
            <p className="text-xs text-gray-400 mt-1">No issues detected. Your office layout looks good.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onDismiss={dismissInsight}
                onAction={handleAction}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}

        {/* Dismissed section */}
        {dismissed.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => useInsightsStore.getState().setShowDismissed(!filter.showDismissed)}
              className="text-xs text-gray-400 hover:text-gray-600 mb-2"
            >
              {filter.showDismissed ? 'Hide' : 'Show'} dismissed ({dismissed.length})
            </button>
            {filter.showDismissed && (
              <div className="flex flex-col gap-2 opacity-60">
                {dismissed.map((insight) => (
                  <div
                    key={insight.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded text-xs text-gray-500"
                  >
                    <span className="truncate">{insight.title}</span>
                    <button
                      onClick={() => restoreInsight(insight.id)}
                      className="ml-2 text-blue-500 hover:text-blue-700 flex-shrink-0"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[10px] text-gray-400">
        <span>Last analyzed: {lastAnalyzedLabel}</span>
        <button
          onClick={triggerAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"
        >
          <RefreshCw size={10} className={isAnalyzing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>
  )
}
