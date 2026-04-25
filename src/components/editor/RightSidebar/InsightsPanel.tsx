import { useEffect, useCallback, useRef, useMemo } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { useInsightsStore } from '../../../stores/insightsStore'
import { useVisibleEmployees } from '../../../hooks/useVisibleEmployees'
import { useAllFloorElements } from '../../../hooks/useActiveFloorElements'
import type { CanvasElement } from '../../../types/elements'
import type { Insight, InsightAction } from '../../../types/insights'
import { useShallow } from 'zustand/react/shallow'
import { SeveritySummary } from './SeveritySummary'
import { InsightFilters } from './InsightFilters'
import { InsightCard } from './InsightCard'
import { UtilizationWidgets } from './UtilizationWidgets'
import { NeighborhoodMetrics } from './NeighborhoodMetrics'
import { NeighborhoodUtilizationList } from './NeighborhoodUtilizationList'
import { AnnotationsPanel } from './AnnotationsPanel'
import { SeatSwapsPanel } from './SeatSwapsPanel'
import { RoomBookingsPanel } from './RoomBookingsPanel'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'
import { focusElements } from '../../../lib/focusElements'
import { PanelHeader } from './PanelHeader'
import { PanelSection } from './PanelSection'
import { PanelEmptyState } from './PanelEmptyState'

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
  // Feed the analyzers the redacted employee map when the viewer lacks
  // `viewPII`. Analyzer outputs often embed the employee's name in card
  // titles ("Jane Doe sits away from their team"); passing redacted
  // records means those titles read as "J.D." automatically — we don't
  // need to rewrite analyzer outputs after the fact.
  const employees = useVisibleEmployees()
  const neighborhoods = useNeighborhoodStore((s) => s.neighborhoods)

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
    const neighborhoodsList = Object.values(neighborhoods)
    runAnalysis(elementsList, employeesList, neighborhoodsList)
  }, [elements, employees, neighborhoods, runAnalysis])

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

  const totalOpen = counts.critical + counts.warning + counts.info

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

  // Wave 17D: refresh affordance lives in the PanelHeader action slot so
  // it sits alongside the title — the old footer placement made it easy
  // to miss at the bottom of a long scroll. Footer still shows the
  // last-analyzed timestamp as a quiet status line.
  const refreshAction = (
    <button
      type="button"
      onClick={triggerAnalysis}
      disabled={isAnalyzing}
      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-800 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-40"
      aria-label="Refresh insights"
      title="Re-run plan analysis"
    >
      <RefreshCw size={12} className={isAnalyzing ? 'animate-spin' : ''} aria-hidden="true" />
      Refresh
    </button>
  )

  return (
    <div className="flex flex-col h-full gap-4">
      <PanelHeader title="Plan health" count={totalOpen} actions={refreshAction} />

      {/* Utilization KPIs — the "is this office healthy?" scan facilities
          asked for. Sits above the severity summary because "are we sized
          right?" is a bigger question than "any issues to fix?". */}
      <UtilizationWidgets />

      {/* Neighborhood utilization — one clickable row per neighborhood
          with the health pill + % bar. Renders nothing when no
          neighborhoods exist. */}
      <NeighborhoodUtilizationList />

      {/* Legacy neighborhood headcount rollup — kept alongside the
          utilization list for now; both render nothing on an empty
          project so they stay invisible until neighborhoods are drawn. */}
      <NeighborhoodMetrics />

      {/* Annotations — sticky notes pinned to elements or floor positions.
          Click a row to focus the anchor. Resolved notes collapse under
          the open list. */}
      <AnnotationsPanel />

      {/* Seat-swap requests — managers approve / deny, requesters cancel. */}
      <SeatSwapsPanel />

      {/* Meeting-room bookings — today's holds rolled up per room.
          Click a row to focus the room. */}
      <RoomBookingsPanel />

      <PanelSection title="Severity" subtitle="Open issues grouped by impact">
        <SeveritySummary
          critical={counts.critical}
          warning={counts.warning}
          info={counts.info}
        />
      </PanelSection>

      <PanelSection title="Filters" subtitle="Narrow the list below">
        <InsightFilters
          activeCategories={filter.categories}
          activeSeverities={filter.severities}
          onToggleCategory={toggleCategory}
          onToggleSeverity={toggleSeverity}
        />
      </PanelSection>

      {/* Insight cards */}
      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        {filtered.length === 0 ? (
          <PanelEmptyState
            icon={ShieldCheck}
            title="No issues detected"
            body="Floorcraft flags orphan seats, proximity problems, and capacity risks automatically. Your plan currently looks clean."
          />
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
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mb-2 tabular-nums"
            >
              {filter.showDismissed ? 'Hide' : 'Show'} dismissed ({dismissed.length})
            </button>
            {filter.showDismissed && (
              <div className="flex flex-col gap-2 opacity-60">
                {dismissed.map((insight) => (
                  <div
                    key={insight.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded text-xs text-gray-500 dark:text-gray-400"
                  >
                    <span className="truncate">{insight.title}</span>
                    <button
                      onClick={() => restoreInsight(insight.id)}
                      className="ml-2 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex-shrink-0"
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

      {/* Footer — quiet status line. The refresh action moved to the
          PanelHeader in Wave 17D. */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500">
        <span className="tabular-nums">Last analyzed: {lastAnalyzedLabel}</span>
      </div>
    </div>
  )
}
