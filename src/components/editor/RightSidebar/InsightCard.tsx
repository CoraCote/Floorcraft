import { X } from 'lucide-react'
import type { Insight, Severity } from '../../../types/insights'

const BORDER_COLORS: Record<Severity, string> = {
  critical: 'border-l-red-500',
  warning: 'border-l-yellow-500',
  info: 'border-l-blue-500',
}

const BADGE_COLORS: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
}

interface InsightCardProps {
  insight: Insight
  onDismiss: (id: string) => void
  onAction: (insightId: string, actionIndex: number) => void
  onClick: (insight: Insight) => void
}

export function InsightCard({ insight, onDismiss, onAction, onClick }: InsightCardProps) {
  return (
    <div
      className={`relative border-l-4 ${BORDER_COLORS[insight.severity]} bg-white rounded-r-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer`}
      onClick={() => onClick(insight)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${BADGE_COLORS[insight.severity]}`}>
            {insight.severity.toUpperCase()}
          </span>
          <span className="text-xs text-gray-400">{insight.category}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss(insight.id)
          }}
          className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold text-gray-800 mb-1">{insight.title}</h4>

      {/* Narrative */}
      <p className="text-xs text-gray-500 leading-relaxed mb-2">{insight.narrative}</p>

      {/* Actions */}
      {insight.actions.length > 0 && (
        <div className="flex gap-1.5">
          {insight.actions.map((action, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation()
                onAction(insight.id, i)
              }}
              className="px-2.5 py-1 text-xs font-medium border border-gray-200 rounded hover:bg-gray-50 transition-colors text-gray-600"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
