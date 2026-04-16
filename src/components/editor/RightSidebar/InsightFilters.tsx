import type { InsightCategory, Severity } from '../../../types/insights'

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  utilization: 'Utilization',
  proximity: 'Team Proximity',
  onboarding: 'Onboarding',
  moves: 'Moves',
  equipment: 'Equipment',
  trends: 'Trends',
}

const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; ring: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-300' },
  warning: { bg: 'bg-yellow-100', text: 'text-yellow-700', ring: 'ring-yellow-300' },
  info: { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-300' },
}

interface InsightFiltersProps {
  activeCategories: Set<InsightCategory>
  activeSeverities: Set<Severity>
  onToggleCategory: (category: InsightCategory) => void
  onToggleSeverity: (severity: Severity) => void
}

export function InsightFilters({
  activeCategories,
  activeSeverities,
  onToggleCategory,
  onToggleSeverity,
}: InsightFiltersProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Severity toggles */}
      <div className="flex gap-1.5">
        {(['critical', 'warning', 'info'] as Severity[]).map((sev) => {
          const active = activeSeverities.has(sev)
          const colors = SEVERITY_COLORS[sev]
          return (
            <button
              key={sev}
              onClick={() => onToggleSeverity(sev)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                active
                  ? `${colors.bg} ${colors.text} ring-1 ${colors.ring}`
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          )
        })}
      </div>

      {/* Category filter chips */}
      <div className="flex gap-1 flex-wrap">
        {(Object.entries(CATEGORY_LABELS) as [InsightCategory, string][]).map(
          ([cat, label]) => {
            const active = activeCategories.has(cat)
            return (
              <button
                key={cat}
                onClick={() => onToggleCategory(cat)}
                className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                  active
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-gray-50 text-gray-400'
                }`}
              >
                {label}
              </button>
            )
          }
        )}
      </div>
    </div>
  )
}
