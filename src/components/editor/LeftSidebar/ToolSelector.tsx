import { useCanvasStore, type ToolType, type WallDrawStyle } from '../../../stores/canvasStore'
import { useCan } from '../../../hooks/useCan'
import {
  MousePointer2,
  Hand,
  Minus,
  DoorOpen,
  SquareIcon,
  Square,
  Circle,
  Slash,
  ArrowRight,
  Type,
  Ruler,
  MapPin,
} from 'lucide-react'

const tools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 size={18} />, shortcut: 'V' },
  { id: 'pan', label: 'Pan', icon: <Hand size={18} />, shortcut: 'Space' },
  { id: 'wall', label: 'Wall', icon: <Minus size={18} />, shortcut: 'W' },
  { id: 'door', label: 'Door', icon: <DoorOpen size={18} />, shortcut: '⇧D' },
  { id: 'window', label: 'Window', icon: <SquareIcon size={18} />, shortcut: '⇧N' },
  // Drawing primitives. Shortcut picks:
  //   R = rect, E = ellipse (C is already taken visually by "Circle" but we
  //   avoid the D/G/M/R conflicts in useKeyboardShortcuts), L = line,
  //   A = arrow, T = text. D is "toggle dimensions" and G is "toggle grid",
  //   so we avoid those.
  { id: 'rect-shape', label: 'Rectangle', icon: <Square size={18} />, shortcut: '⇧R' },
  { id: 'ellipse', label: 'Ellipse', icon: <Circle size={18} />, shortcut: 'E' },
  { id: 'line-shape', label: 'Line', icon: <Slash size={18} />, shortcut: 'L' },
  { id: 'arrow', label: 'Arrow', icon: <ArrowRight size={18} />, shortcut: 'A' },
  { id: 'free-text', label: 'Text', icon: <Type size={18} />, shortcut: 'T' },
  // Measure is a read-only tool — architects and facilities managers use
  // it often to check corridor widths and room sizes, so we expose it
  // alongside the primitives. Shift+M because plain M jumps to Map view.
  { id: 'measure', label: 'Measure', icon: <Ruler size={18} />, shortcut: '⇧M' },
  // Neighborhoods: drag-create a labeled zone that tints a seat region.
  // Plain G is "toggle grid", so the tool is shift-locked to ⇧G.
  { id: 'neighborhood', label: 'Neighborhood', icon: <MapPin size={18} />, shortcut: '⇧G' },
]

const WALL_STYLES: { id: WallDrawStyle; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
]

export function ToolSelector() {
  const activeTool = useCanvasStore((s) => s.activeTool)
  const setActiveTool = useCanvasStore((s) => s.setActiveTool)
  const wallDrawStyle = useCanvasStore((s) => s.wallDrawStyle)
  const setWallDrawStyle = useCanvasStore((s) => s.setWallDrawStyle)
  const canEdit = useCan('editMap')

  // Viewers only get the navigation tools (select, pan). The creation tools
  // would be silently no-ops against CanvasStage's canEdit guard — hiding
  // them keeps the picker from implying capabilities the role doesn't have.
  // Viewers keep Select, Pan, and Measure — the first two are navigation,
  // the third is read-only, so none expand the viewer's capability surface.
  const visibleTools = canEdit
    ? tools
    : tools.filter((t) => t.id === 'select' || t.id === 'pan' || t.id === 'measure')

  return (
    <div className="p-3">
      <div className="flex flex-col gap-0.5">
        {visibleTools.map((tool) => (
          <div key={tool.id}>
            <button
              onClick={() => setActiveTool(tool.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors ${
                activeTool === tool.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
            >
              {tool.icon}
              <span>{tool.label}</span>
              {tool.shortcut && (
                <span className="ml-auto text-[10px] text-gray-400 font-mono">{tool.shortcut}</span>
              )}
            </button>
            {/* Wall-style presets. Only visible with the wall tool active so
                the sidebar doesn't get noisy with options for inactive tools. */}
            {tool.id === 'wall' && activeTool === 'wall' && (
              <div
                role="radiogroup"
                aria-label="Wall line style"
                className="flex gap-1 px-2.5 pb-1 pt-0.5"
              >
                {WALL_STYLES.map((s) => (
                  <button
                    key={s.id}
                    role="radio"
                    aria-checked={wallDrawStyle === s.id}
                    onClick={() => setWallDrawStyle(s.id)}
                    className={`flex-1 px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                      wallDrawStyle === s.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
