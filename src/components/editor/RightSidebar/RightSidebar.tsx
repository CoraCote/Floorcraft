import { useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { AlertTriangle, BarChart3, Settings, Users, Wifi } from 'lucide-react'
import { useInsightsStore } from '../../../stores/insightsStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCan } from '../../../hooks/useCan'
import { DevicesPanel } from './DevicesPanel'
import { InsightsPanel } from './InsightsPanel'
import { PeoplePanel } from './PeoplePanel'
import { PropertiesPanel } from './PropertiesPanel'
import { ReportsPanel } from './ReportsPanel'
import { SidebarToggle } from './SidebarToggle'

type TabId = 'properties' | 'people' | 'reports' | 'devices' | 'insights'

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

  // Devices tab is permission-gated on `viewITLayer` (added in M2). The
  // stand-in `editMap` gate from the original M3 PR has been retired
  // now that M2's permission landed on main. Granted to owner / editor
  // / space-planner; denied to hr-editor / viewer / shareViewer.
  const canViewDevices = useCan('viewITLayer')

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = useMemo(() => {
    const list: { id: TabId; label: string; icon: ReactNode }[] = [
      { id: 'properties', label: 'Properties', icon: <Settings size={14} aria-hidden="true" /> },
      { id: 'people', label: 'People', icon: <Users size={14} aria-hidden="true" /> },
      { id: 'reports', label: 'Reports', icon: <BarChart3 size={14} aria-hidden="true" /> },
    ]
    if (canViewDevices) {
      list.push({ id: 'devices', label: 'Devices', icon: <Wifi size={14} aria-hidden="true" /> })
    }
    list.push({ id: 'insights', label: 'Insights', icon: <AlertTriangle size={14} aria-hidden="true" /> })
    return list
  }, [canViewDevices])

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
    devices: null,
    insights: null,
  })

  // Arrow-left / arrow-right roving within the tablist, per the APG tabs
  // pattern. We move focus AND activate the new tab so the panel below
  // updates in lockstep — that's the "automatic activation" variant,
  // which is the right default for lightweight tabs like these (no
  // async panel content, no expensive mount).
  // If the persisted/active tab id isn't in the visible set (e.g. a
  // user previously selected Devices, then their permission was
  // revoked), fall back to Properties so the empty tabpanel isn't
  // rendered. This is purely a render-time guard — we don't mutate the
  // store from here so a permission re-grant restores the prior tab.
  const safeTab: TabId = tabs.some((t) => t.id === tab) ? tab : 'properties'

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const idx = tabs.findIndex((t) => t.id === safeTab)
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
      <div className="flex items-stretch border-b border-gray-200 dark:border-gray-800">
        {/* Collapse handle lives at the leftmost slot of the tablist
            row so it reads as part of the side panel, not part of the
            top ribbon. The four content tabs follow to the right. */}
        <SidebarToggle variant="inline" />
        <div
          role="tablist"
          aria-label="Right sidebar"
          className="flex flex-1"
          onKeyDown={onKeyDown}
        >
        {tabs.map((t) => {
          const selected = safeTab === t.id
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
                // The bare numeric badge reads as just a number to a
                // screen reader. Wrapping it with an `aria-label` and
                // a visually-hidden long form ("3 active insights")
                // turns the chip into something a non-sighted user can
                // act on, while sighted users still see the compact
                // count.
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full"
                  aria-label={`${badgeCount} active ${badgeCount === 1 ? 'insight' : 'insights'}`}
                >
                  <span aria-hidden="true">{badgeCount}</span>
                </span>
              )}
            </button>
          )
        })}
        </div>
      </div>
      <div
        role="tabpanel"
        id={panelId(safeTab)}
        aria-labelledby={tabId(safeTab)}
        className="flex-1 overflow-y-auto p-3"
      >
        {safeTab === 'properties' && <PropertiesPanel />}
        {safeTab === 'people' && <PeoplePanel />}
        {safeTab === 'reports' && <ReportsPanel />}
        {safeTab === 'devices' && canViewDevices && <DevicesPanel />}
        {safeTab === 'insights' && <InsightsPanel />}
      </div>
    </div>
  )
}
