import { useCanvasStore, type ToolType } from '../../../stores/canvasStore'
import { MousePointer2, Hand, Minus, DoorOpen, SquareIcon } from 'lucide-react'

const tools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 size={18} />, shortcut: 'V' },
  { id: 'pan', label: 'Pan', icon: <Hand size={18} />, shortcut: 'Space' },
  { id: 'wall', label: 'Wall', icon: <Minus size={18} />, shortcut: 'W' },
  { id: 'door', label: 'Door', icon: <DoorOpen size={18} />, shortcut: 'D' },
  { id: 'window', label: 'Window', icon: <SquareIcon size={18} />, shortcut: '' },
]

export function ToolSelector() {
  const activeTool = useCanvasStore((s) => s.activeTool)
  const setActiveTool = useCanvasStore((s) => s.setActiveTool)

  return (
    <div className="p-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tools</div>
      <div className="flex flex-col gap-0.5">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors ${
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
        ))}
      </div>
    </div>
  )
}
