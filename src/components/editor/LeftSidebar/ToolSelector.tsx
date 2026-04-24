import { useState } from 'react'
import { useCanvasStore, type ToolType, type WallDrawStyle } from '../../../stores/canvasStore'
import { useCan } from '../../../hooks/useCan'
import { useFirstUseTooltip } from '../../../hooks/useFirstUseTooltip'
import { FirstUseTooltip } from '../FirstUseTooltip'
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

interface ToolDef {
  id: ToolType
  label: string
  icon: React.ReactNode
  shortcut: string
  /** One-line first-use description shown in the rich hover tooltip. */
  description: string
}

const tools: ToolDef[] = [
  {
    id: 'select',
    label: 'Select',
    icon: <MousePointer2 size={18} aria-hidden="true" />,
    shortcut: 'V',
    description: 'Click an element to select. Drag to move, or lasso to multi-select.',
  },
  {
    id: 'pan',
    label: 'Pan',
    icon: <Hand size={18} aria-hidden="true" />,
    shortcut: 'Space',
    description: 'Drag the canvas to reposition the view. Hold Space to pan temporarily.',
  },
  {
    id: 'wall',
    label: 'Wall',
    icon: <Minus size={18} aria-hidden="true" />,
    shortcut: 'W',
    description: 'Click and drag to draw a straight wall. Click to chain segments.',
  },
  {
    id: 'door',
    label: 'Door',
    icon: <DoorOpen size={18} aria-hidden="true" />,
    shortcut: '⇧D',
    description: 'Click a wall to drop in a door at that position.',
  },
  {
    id: 'window',
    label: 'Window',
    icon: <SquareIcon size={18} aria-hidden="true" />,
    shortcut: '⇧N',
    description: 'Click a wall to place a window along its length.',
  },
  // Drawing primitives. Shortcut picks:
  //   R = rect, E = ellipse (C is already taken visually by "Circle" but we
  //   avoid the D/G/M/R conflicts in useKeyboardShortcuts), L = line,
  //   A = arrow, T = text. D is "toggle dimensions" and G is "toggle grid",
  //   so we avoid those.
  {
    id: 'rect-shape',
    label: 'Rectangle',
    icon: <Square size={18} aria-hidden="true" />,
    shortcut: '⇧R',
    description: 'Click and drag to draw a rectangle. Useful for rough space blocks.',
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    icon: <Circle size={18} aria-hidden="true" />,
    shortcut: 'E',
    description: 'Click and drag to draw an ellipse. Hold Shift for a perfect circle.',
  },
  {
    id: 'line-shape',
    label: 'Line',
    icon: <Slash size={18} aria-hidden="true" />,
    shortcut: 'L',
    description: 'Click and drag to draw a straight line for annotations.',
  },
  {
    id: 'arrow',
    label: 'Arrow',
    icon: <ArrowRight size={18} aria-hidden="true" />,
    shortcut: 'A',
    description: 'Click and drag to draw an arrow. Great for call-outs and flow.',
  },
  {
    id: 'free-text',
    label: 'Text',
    icon: <Type size={18} aria-hidden="true" />,
    shortcut: 'T',
    description: 'Click anywhere to drop a text label on the canvas.',
  },
  // Measure is a read-only tool — architects and facilities managers use
  // it often to check corridor widths and room sizes, so we expose it
  // alongside the primitives. Shift+M because plain M jumps to Map view.
  {
    id: 'measure',
    label: 'Measure',
    icon: <Ruler size={18} aria-hidden="true" />,
    shortcut: '⇧M',
    description: 'Click points to measure distance. Double-click or Enter to finish.',
  },
  // Neighborhoods: drag-create a labeled zone that tints a seat region.
  // Plain G is "toggle grid", so the tool is shift-locked to ⇧G.
  {
    id: 'neighborhood',
    label: 'Neighborhood',
    icon: <MapPin size={18} aria-hidden="true" />,
    shortcut: '⇧G',
    description: 'Drag on empty canvas to paint a labeled zone for a team or group.',
  },
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
  const { showRichTooltip, markToolUsed } = useFirstUseTooltip()

  // Hovered tool id; only one rich tooltip is visible at a time to avoid
  // a stack of cards when the user sweeps the cursor down the rail.
  const [hoveredToolId, setHoveredToolId] = useState<ToolType | null>(null)

  // Viewers only get the navigation tools (select, pan). The creation tools
  // would be silently no-ops against CanvasStage's canEdit guard — hiding
  // them keeps the picker from implying capabilities the role doesn't have.
  // Viewers keep Select, Pan, and Measure — the first two are navigation,
  // the third is read-only, so none expand the viewer's capability surface.
  const visibleTools = canEdit
    ? tools
    : tools.filter((t) => t.id === 'select' || t.id === 'pan' || t.id === 'measure')

  const handleToolClick = (tool: ToolDef) => {
    setActiveTool(tool.id)
    markToolUsed(tool.id)
  }

  return (
    <div className="p-3">
      <div className="flex flex-col gap-0.5">
        {visibleTools.map((tool) => {
          const isRich = hoveredToolId === tool.id && showRichTooltip(tool.id)
          const tooltipId = `first-use-tooltip-${tool.id}`
          return (
            <div key={tool.id} className="relative">
              <button
                onClick={() => handleToolClick(tool)}
                onMouseEnter={() => setHoveredToolId(tool.id)}
                onMouseLeave={() =>
                  setHoveredToolId((prev) => (prev === tool.id ? null : prev))
                }
                onFocus={() => setHoveredToolId(tool.id)}
                onBlur={() =>
                  setHoveredToolId((prev) => (prev === tool.id ? null : prev))
                }
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm transition-colors ${
                  activeTool === tool.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                aria-describedby={isRich ? tooltipId : undefined}
              >
                {tool.icon}
                <span>{tool.label}</span>
                {tool.shortcut && (
                  <span className="ml-auto text-[10px] text-gray-400 font-mono">{tool.shortcut}</span>
                )}
              </button>
              {isRich && (
                <FirstUseTooltip
                  id={tooltipId}
                  name={tool.label}
                  description={tool.description}
                  shortcut={tool.shortcut}
                  icon={tool.icon}
                />
              )}
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
          )
        })}
      </div>
    </div>
  )
}
