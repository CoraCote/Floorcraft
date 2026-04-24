import { useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { AlertTriangle, BarChart3, Settings, Users } from 'lucide-react'
import { useInsightsStore } from '../../../stores/insightsStore'
import { useUIStore } from '../../../stores/uiStore'
import { InsightsPanel } from './InsightsPanel'
import { PeoplePanel } from './PeoplePanel'
import { PropertiesPanel } from './PropertiesPanel'
import { ReportsPanel } from './ReportsPanel'

type TabId = 'properties' | 'people' | 'reports' | 'insights'

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

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: 'properties', label: 'Properties', icon: <Settings size={14} aria-hidden="true" /> },
    { id: 'people', label: 'People', icon: <Users size={14} aria-hidden="true" /> },
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={14} aria-hidden="true" /> },
    { id: 'insights', label: 'Insights', icon: <AlertTriangle size={14} aria-hidden="true" /> },
  ]

  // Stable id prefix so each tab <-> panel pair can reference each other
  // via aria-controls / aria-labelledby without colliding if multiple
  // RightSidebars ever mount simultaneously.
  const idBase = useId()
  const tabId = (id: TabId) => `${idBase}-tab-${id}`
  const panelId = (id: TabId) => `${idBase}-panel-${id}`

  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    properties: null,
    people: null,
    reports: null,
    insights: null,
  })

  // Arrow-left / arrow-right roving within the tablist, per the APG tabs
  // pattern. We move focus AND activate the new tab so the panel below
  // updates in lockstep — that's the "automatic activation" variant,
  // which is the right default for lightweight tabs like these (no
  // async panel content, no expensive mount).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const idx = tabs.findIndex((t) => t.id === tab)
    let next = idx
    if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    const nextTab = tabs[next].id
    setTab(nextTab)
    tabRefs.current[nextTab]?.focus()
  }

  return (
    <div className="flex flex-col h-full">
      <div
        role="tablist"
        aria-label="Right sidebar"
        className="flex border-b border-gray-200 dark:border-gray-800"
        onKeyDown={onKeyDown}
      >
        {tabs.map((t) => {
          const selected = tab === t.id
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el
              }}
              id={tabId(t.id)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId(t.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors relative flex items-center justify-center gap-1.5 ${
                selected
                  ? 'text-blue-700 dark:text-blue-300 border-b-2 border-blue-700'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
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
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={panelId(tab)}
        aria-labelledby={tabId(tab)}
        className="flex-1 overflow-y-auto p-3"
      >
        {tab === 'properties' && <PropertiesPanel />}
        {tab === 'people' && <PeoplePanel />}
        {tab === 'reports' && <ReportsPanel />}
        {tab === 'insights' && <InsightsPanel />}
      </div>
    </div>
  )
}
