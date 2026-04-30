import { useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { AlertTriangle, Compass, Users } from 'lucide-react'
import { useInsightsStore } from '../../../stores/insightsStore'
import { useUIStore } from '../../../stores/uiStore'
import { useCan } from '../../../hooks/useCan'
import { CollapsibleSection } from '../LeftSidebar/CollapsibleSection'
import { DevicesPanel } from './DevicesPanel'
import { InsightsPanel } from './InsightsPanel'
import { OfficeCommentsPanel } from './OfficeCommentsPanel'
import { PeoplePanel } from './PeoplePanel'
import { PropertiesPanel } from './PropertiesPanel'
import { ReportsPanel } from './ReportsPanel'
import { SidebarToggle } from './SidebarToggle'

type TabId = 'plan' | 'roster' | 'insights'

/**
 * Wave 21B — three-tab right inspector grouped by intent.
 *
 * The previous five-tab strip (Properties · People · Reports · Devices ·
 * Insights) packed five sibling tabs in a 320-px sidebar; at narrow
 * widths the labels truncated. The reorg collapses them into three
 * purpose-driven parents that match the operator's mental model:
 *
 *   • Plan     — the canvas's contents. Properties (the selection
 *                inspector) and Devices (the IT-layer table) are
 *                both about *things on the plan*; they stack inside
 *                the same tab as collapsible sections.
 *   • Roster   — the people side of the office. The People panel
 *                renders directly — no nesting needed.
 *   • Insights — observations and analytics. Insights (warnings) and
 *                Reports (summary metrics) stack as collapsible
 *                sections; the badge count surfaces on the parent tab
 *                so the operator sees pending issues without opening
 *                the panel.
 *
 * Stacking inside parents uses `<CollapsibleSection>` (the same
 * primitive the LeftSidebar uses for Layers + Library) so each
 * sub-panel can be folded away when not in use — useful at narrow
 * sidebar widths where a single panel needs the full vertical space.
 */
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

  // The Devices section inside Plan is permission-gated on `viewITLayer`.
  // Granted to owner / editor / space-planner; denied to hr-editor /
  // viewer / shareViewer.
  const canViewDevices = useCan('viewITLayer')

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: 'plan', label: 'Plan', icon: <Compass size={14} aria-hidden="true" /> },
    { id: 'roster', label: 'Roster', icon: <Users size={14} aria-hidden="true" /> },
    {
      id: 'insights',
      label: 'Insights',
      icon: <AlertTriangle size={14} aria-hidden="true" />,
    },
  ]

  const idBase = useId()
  const tabId = (id: TabId) => `${idBase}-tab-${id}`
  const panelId = (id: TabId) => `${idBase}-panel-${id}`

  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    plan: null,
    roster: null,
    insights: null,
  })

  // Arrow-left / arrow-right roving within the tablist (APG tabs pattern,
  // automatic activation variant — tab content is cheap so focus + select
  // happen together).
  const safeTab: TabId = tabs.some((t) => t.id === tab) ? tab : 'plan'

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
    <div className="flex flex-col h-full bg-[color:var(--color-paper-raised)] dark:bg-gray-900">
      <div className="flex items-stretch border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
        {/* Collapse handle in the leftmost slot of the tablist row so
            it reads as part of the side panel, not the top ribbon. */}
        <SidebarToggle variant="inline" />
        <div
          role="tablist"
          aria-label="Right sidebar"
          className="flex flex-1 min-w-0"
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
                className={`flex-1 min-w-0 px-2 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] font-medium transition-colors relative flex items-center justify-center gap-1.5 ${
                  selected
                    ? 'text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] border-b-2 border-[color:var(--color-blueprint)]'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border-b-2 border-transparent'
                }`}
              >
                <span className="flex-shrink-0">{t.icon}</span>
                <span className="truncate min-w-0">{t.label}</span>
                {t.id === 'insights' && badgeCount > 0 && (
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
        // Plan + Insights tabpanels host CollapsibleSections which own
        // their own padding; we drop the wrapper padding for those. The
        // Roster tab still uses padding because PeoplePanel renders
        // tightly without its own wrapper.
        className={`flex-1 overflow-y-auto ${
          safeTab === 'roster' ? 'p-3' : ''
        }`}
      >
        {safeTab === 'plan' && (
          <>
            <CollapsibleSection
              title="Selection"
              defaultOpen
              storageKey="right-plan-selection"
            >
              <div className="p-3">
                <PropertiesPanel />
              </div>
            </CollapsibleSection>
            {canViewDevices && (
              <CollapsibleSection
                title="IT devices"
                defaultOpen={false}
                storageKey="right-plan-devices"
              >
                <div className="p-3">
                  <DevicesPanel />
                </div>
              </CollapsibleSection>
            )}
          </>
        )}
        {safeTab === 'roster' && <PeoplePanel />}
        {safeTab === 'insights' && (
          <>
            <CollapsibleSection
              title="Warnings"
              defaultOpen
              storageKey="right-insights-warnings"
            >
              <div className="p-3">
                <InsightsPanel />
              </div>
            </CollapsibleSection>
            <CollapsibleSection
              title="Reports"
              defaultOpen={false}
              storageKey="right-insights-reports"
            >
              <div className="p-3">
                <ReportsPanel />
              </div>
            </CollapsibleSection>
            <CollapsibleSection
              title="Comments"
              defaultOpen={false}
              storageKey="right-insights-comments"
            >
              <div className="p-3">
                <OfficeCommentsPanel />
              </div>
            </CollapsibleSection>
          </>
        )}
      </div>
    </div>
  )
}
