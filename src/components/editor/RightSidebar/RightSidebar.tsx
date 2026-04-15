import { useUIStore } from '../../../stores/uiStore'
import { GuestListPanel } from './GuestListPanel'
import { PropertiesPanel } from './PropertiesPanel'

export function RightSidebar() {
  const tab = useUIStore((s) => s.rightSidebarTab)
  const setTab = useUIStore((s) => s.setRightSidebarTab)

  const tabs = [
    { id: 'properties' as const, label: 'Properties' },
    { id: 'guests' as const, label: 'Guests' },
    { id: 'comments' as const, label: 'Comments' },
    { id: 'versions' as const, label: 'Versions' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? 'text-blue-700 border-b-2 border-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'properties' && <PropertiesPanel />}
        {tab === 'guests' && <GuestListPanel />}
        {tab === 'comments' && <div className="text-sm text-gray-400">Comments panel</div>}
        {tab === 'versions' && <div className="text-sm text-gray-400">Version history panel</div>}
      </div>
    </div>
  )
}
