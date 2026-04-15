import { useUIStore } from '../../stores/uiStore'

const shortcuts = [
  { keys: 'Ctrl+Z', action: 'Undo' },
  { keys: 'Ctrl+Shift+Z', action: 'Redo' },
  { keys: 'Delete', action: 'Delete selected' },
  { keys: 'Ctrl+D', action: 'Duplicate' },
  { keys: 'Ctrl+A', action: 'Select all' },
  { keys: 'Ctrl+G', action: 'Group' },
  { keys: 'Ctrl+Shift+G', action: 'Ungroup' },
  { keys: 'Ctrl+L', action: 'Lock/Unlock' },
  { keys: 'Arrows', action: 'Nudge (Shift=10px)' },
  { keys: 'Ctrl++/-', action: 'Zoom in/out' },
  { keys: 'Ctrl+0', action: 'Reset zoom' },
  { keys: 'V', action: 'Select tool' },
  { keys: 'W', action: 'Wall tool' },
  { keys: 'G', action: 'Toggle grid' },
  { keys: 'P', action: 'Presentation mode' },
  { keys: 'Escape', action: 'Deselect / exit' },
  { keys: '?', action: 'Show shortcuts' },
]

export function KeyboardShortcutsOverlay() {
  const open = useUIStore((s) => s.shortcutsOverlayOpen)
  const setOpen = useUIStore((s) => s.setShortcutsOverlayOpen)

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="grid grid-cols-2 gap-y-2 gap-x-4">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between col-span-2">
              <span className="text-sm text-gray-600">{s.action}</span>
              <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs font-mono text-gray-700">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
