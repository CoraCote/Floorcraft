import { useMemo, type ReactNode } from 'react'
import { AlertTriangle, BarChart3, Settings, Users } from 'lucide-react'
import { useInsightsStore } from '../../../stores/insightsStore'
import { useUIStore } from '../../../stores/uiStore'
import { InsightsPanel } from './InsightsPanel'
import { PeoplePanel } from './PeoplePanel'
import { PropertiesPanel } from './PropertiesPanel'
import { ReportsPanel } from './ReportsPanel'

export function RightSidebar() {
  const tab = useUIStore((s) => s.rightSidebarTab)
  const setTab = useUIStore((s) => s.setRightSidebarTab)

  const insights = useInsightsStore((s) => s.insights)
  const badgeCount = useMemo(() => {
    let critical = 0
    let warning = 0
    for (const i of insights) {
      if (i.dismissed) continue
      if (i.severity === 'critical') critical++
      else if (i.severity === 'warning') warning++
    }
    return critical + warning
  }, [insights])

  const tabs: { id: 'properties' | 'people' | 'reports' | 'insights'; label: string; icon: ReactNode }[] = [
    { id: 'properties', label: 'Properties', icon: <Settings size={14} /> },
    { id: 'people', label: 'People', icon: <Users size={14} /> },
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={14} /> },
    { id: 'insights', label: 'Insights', icon: <AlertTriangle size={14} /> },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors relative flex items-center justify-center gap-1.5 ${
              tab === t.id
                ? 'text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.id === 'insights' && badgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">
                {badgeCount}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'properties' && <PropertiesPanel />}
        {tab === 'people' && <PeoplePanel />}
        {tab === 'reports' && <ReportsPanel />}
        {tab === 'insights' && <InsightsPanel />}
      </div>
    </div>
  )
}
