import { useUIStore } from '../../stores/uiStore'

type ShortcutRow = { keys: string; action: string }
type ShortcutGroup = { title: string; rows: ShortcutRow[] }

// Grouped so the overlay reads like a cheat sheet rather than a flat
// dump. Order within each group roughly tracks frequency of use.
const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Editing',
    rows: [
      { keys: 'Ctrl+Z', action: 'Undo' },
      { keys: 'Ctrl+Shift+Z', action: 'Redo' },
      { keys: 'Delete', action: 'Delete selected' },
      { keys: 'Ctrl+D', action: 'Duplicate' },
      { keys: 'Ctrl+A', action: 'Select all' },
      { keys: 'Ctrl+G', action: 'Group' },
      { keys: 'Ctrl+Shift+G', action: 'Ungroup' },
      { keys: 'Ctrl+L', action: 'Lock / unlock' },
      { keys: 'Drag', action: 'Marquee-select (on empty canvas)' },
      { keys: 'Arrows', action: 'Nudge 1px (Shift = 10px)' },
    ],
  },
  {
    title: 'Navigation',
    rows: [
      { keys: 'Space + Drag', action: 'Pan canvas (hold Space)' },
      { keys: 'Shift + Wheel', action: 'Pan horizontally' },
      { keys: 'Two-finger Drag', action: 'Pan (trackpad)' },
      { keys: 'Arrows', action: 'Pan (with no selection)' },
      { keys: 'Middle-Click Drag', action: 'Pan' },
    ],
  },
  {
    title: 'Tools',
    rows: [
      { keys: 'V', action: 'Select' },
      { keys: 'W', action: 'Wall' },
      { keys: 'R / Shift+R', action: 'Rectangle' },
      { keys: 'E', action: 'Ellipse' },
      { keys: 'L', action: 'Line' },
      { keys: 'A', action: 'Arrow' },
      { keys: 'T', action: 'Text' },
    ],
  },
  {
    title: 'View',
    rows: [
      { keys: 'Ctrl + / Ctrl -', action: 'Zoom in / out' },
      { keys: 'Ctrl+0', action: 'Reset zoom' },
      { keys: 'G', action: 'Toggle grid' },
      { keys: 'D', action: 'Toggle dimensions' },
      { keys: 'P', action: 'Presentation mode' },
      { keys: 'M', action: 'Jump to map view' },
      { keys: 'R', action: 'Jump to roster view' },
    ],
  },
  {
    title: 'General',
    rows: [
      { keys: 'Escape', action: 'Deselect / cancel / exit' },
      { keys: '?', action: 'Show this overlay' },
    ],
  },
]

export function KeyboardShortcutsOverlay() {
  const open = useUIStore((s) => s.shortcutsOverlayOpen)
  const setOpen = useUIStore((s) => s.setShortcutsOverlayOpen)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-heading"
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="shortcuts-heading" className="text-lg font-semibold text-gray-900">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-600 text-xl"
            aria-label="Close shortcuts overlay"
          >
            &times;
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          On macOS, <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-mono">Ctrl</kbd> is <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-mono">{'\u2318'}</kbd>.
          Single-letter tool keys only fire when no input is focused.
        </p>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
          {shortcutGroups.map((group) => (
            <section key={group.title}>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {group.title}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {group.rows.map((row) => (
                  <li key={row.keys} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-700">{row.action}</span>
                    <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs font-mono text-gray-700 whitespace-nowrap">
                      {row.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
