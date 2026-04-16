import { useEffect, useCallback, useRef, useMemo } from 'react'
import { RefreshCw, CheckCircle } from 'lucide-react'
import { useInsightsStore } from '../../../stores/insightsStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useEmployeeStore } from '../../../stores/employeeStore'
import { useShallow } from 'zustand/react/shallow'
import { SeveritySummary } from './SeveritySummary'
import { InsightFilters } from './InsightFilters'
import { InsightCard } from './InsightCard'

export function InsightsPanel() {
  const elements = useElementsStore((s) => s.elements)
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAction = useCallback((_insightId: string, _actionIndex: number) => {
    // Action execution will be wired to canvas navigation/assignment in future tasks
  }, [])

  const handleCardClick = useCallback(() => {
    // Highlight related elements on canvas — future wire-up
  }, [])

  const lastAnalyzedLabel = useMemo(
    () =>
      lastAnalyzedAt
        ? new Date(lastAnalyzedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'never',
    [lastAnalyzedAt]
  )

  return (
    <div className="flex flex-col h-full gap-3">
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
