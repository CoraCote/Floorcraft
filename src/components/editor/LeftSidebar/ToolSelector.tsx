import { useState } from 'react'
import {
  useCanvasStore,
  type ToolType,
  type WallDrawStyle,
  type LineDrawStyle,
} from '../../../stores/canvasStore'
import { useCan } from '../../../hooks/useCan'
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
  description: string
}

/**
 * Tool list for the left sidebar.
 *
 * Layout: full-width rows with icon + label + right-aligned shortcut
 * pill. The previous icon-only 56-px rail (Wave 21A) made experienced
 * tools harder to find — the operator scanned a column of glyphs
 * instead of names. This restores the original list shape while
 * keeping the more recent quality-of-life additions:
 *
 *   - Rich hover tooltip card on EVERY hover (not just first use),
 *     showing name + 1-line description + shortcut.
 *   - Stroke-style picker (solid / dashed / dotted) for wall, line,
 *     and arrow when active — not just wall.
 *   - Native `title` attribute as a screen-reader-friendly fallback.
 *
 * Group dividers separate Navigation / Architecture / Shapes /
 * Measure so the eye still parses the rail by intent.
 */

type ToolGroup = ReadonlyArray<ToolDef>

const NAV_GROUP: ToolGroup = [
  {
    id: 'select',
    label: 'Select',
    icon: <MousePointer2 size={16} aria-hidden="true" />,
    shortcut: 'V',
    description: 'Click an element to select, drag empty canvas to pan, Shift+drag to lasso.',
  },
  {
    id: 'pan',
    label: 'Pan',
    icon: <Hand size={16} aria-hidden="true" />,
    shortcut: 'Space',
    description: 'Dedicated pan mode. Hold Space anywhere for a temporary pan instead.',
  },
]

const ARCHITECTURE_GROUP: ToolGroup = [
  {
    id: 'wall',
    label: 'Wall',
    icon: <Minus size={16} aria-hidden="true" />,
    shortcut: 'W',
    description: 'Click and drag to draw a straight wall. Click to chain segments.',
  },
  {
    id: 'door',
    label: 'Door',
    icon: <DoorOpen size={16} aria-hidden="true" />,
    shortcut: '⇧D',
    description: 'Click a wall to drop in a door at that position.',
  },
  {
    id: 'window',
    label: 'Window',
    icon: <SquareIcon size={16} aria-hidden="true" />,
    shortcut: '⇧N',
    description: 'Click a wall to place a window along its length.',
  },
  {
    id: 'room',
    label: 'Room',
    icon: <Square size={16} aria-hidden="true" />,
    shortcut: '⇧O',
    description: 'Click and drag to draw a 4-wall rectangular room. Hold Shift for a square.',
  },
]

const SHAPE_GROUP: ToolGroup = [
  {
    id: 'rect-shape',
    label: 'Rectangle',
    icon: <Square size={16} aria-hidden="true" />,
    shortcut: '⇧R',
    description: 'Click and drag to draw a rectangle. Useful for rough space blocks.',
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    icon: <Circle size={16} aria-hidden="true" />,
    shortcut: 'E',
    description: 'Click and drag to draw an ellipse. Hold Shift for a perfect circle.',
  },
  {
    id: 'line-shape',
    label: 'Line',
    icon: <Slash size={16} aria-hidden="true" />,
    shortcut: 'L',
    description: 'Click and drag to draw a straight line. Pick solid, dashed, or dotted below.',
  },
  {
    id: 'arrow',
    label: 'Arrow',
    icon: <ArrowRight size={16} aria-hidden="true" />,
    shortcut: 'A',
    description: 'Click and drag to draw an arrow. Solid, dashed, or dotted below.',
  },
  {
    id: 'free-text',
    label: 'Text',
    icon: <Type size={16} aria-hidden="true" />,
    shortcut: 'T',
    description: 'Click anywhere to drop a text label on the canvas.',
  },
]

const MEASURE_GROUP: ToolGroup = [
  {
    id: 'measure',
    label: 'Measure',
    icon: <Ruler size={16} aria-hidden="true" />,
    shortcut: '⇧M',
    description: 'Click points to measure distance. Double-click or Enter to finish.',
  },
  {
    id: 'neighborhood',
    label: 'Neighborhood',
    icon: <MapPin size={16} aria-hidden="true" />,
    shortcut: '⇧G',
    description: 'Drag on empty canvas to paint a labeled zone for a team or group.',
  },
]

const GROUPS = [NAV_GROUP, ARCHITECTURE_GROUP, SHAPE_GROUP, MEASURE_GROUP] as const

const STROKE_STYLES: Array<{
  id: WallDrawStyle | LineDrawStyle
  label: string
}> = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
]

export function ToolSelector() {
  const activeTool = useCanvasStore((s) => s.activeTool)
  const setActiveTool = useCanvasStore((s) => s.setActiveTool)
  const wallDrawStyle = useCanvasStore((s) => s.wallDrawStyle)
  const setWallDrawStyle = useCanvasStore((s) => s.setWallDrawStyle)
  const lineDrawStyle = useCanvasStore((s) => s.lineDrawStyle)
  const setLineDrawStyle = useCanvasStore((s) => s.setLineDrawStyle)
  const canEdit = useCan('editMap')
  const [hoveredToolId, setHoveredToolId] = useState<ToolType | null>(null)

  const visibleGroups: ReadonlyArray<ToolGroup> = canEdit
    ? GROUPS
    : [NAV_GROUP, [MEASURE_GROUP[0]] as ToolGroup]

  return (
    <div className="p-2 flex flex-col">
      {visibleGroups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {gi > 0 && (
            <div
              aria-hidden="true"
              className="my-1.5 h-px w-full bg-[color:var(--color-paper-line)] dark:bg-gray-700"
            />
          )}
          {group.map((tool) => {
            const isHovered = hoveredToolId === tool.id
            const tooltipId = `tool-tooltip-${tool.id}`
            const isActive = activeTool === tool.id
            const showStylePicker =
              isActive &&
              (tool.id === 'wall' || tool.id === 'line-shape' || tool.id === 'arrow')
            const styleValue = tool.id === 'wall' ? wallDrawStyle : lineDrawStyle
            const setStyle = tool.id === 'wall' ? setWallDrawStyle : setLineDrawStyle
            return (
              <div key={tool.id} className={`relative ${isHovered ? 'z-10' : ''}`}>
                <button
                  onClick={() => setActiveTool(tool.id)}
                  onMouseEnter={() => setHoveredToolId(tool.id)}
                  onMouseLeave={() =>
                    setHoveredToolId((p) => (p === tool.id ? null : p))
                  }
                  onFocus={() => setHoveredToolId(tool.id)}
                  onBlur={() => setHoveredToolId((p) => (p === tool.id ? null : p))}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm transition-colors min-w-0 ${
                    isActive
                      ? 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] font-medium'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800'
                  }`}
                  title={tool.shortcut ? `${tool.label} (${tool.shortcut}) — ${tool.description}` : `${tool.label} — ${tool.description}`}
                  aria-pressed={isActive}
                  aria-describedby={isHovered ? tooltipId : undefined}
                >
                  <span className="flex-shrink-0">{tool.icon}</span>
                  <span className="truncate min-w-0 text-left flex-1">{tool.label}</span>
                  {tool.shortcut && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono flex-shrink-0">
                      {tool.shortcut}
                    </span>
                  )}
                </button>
                {isHovered && (
                  <FirstUseTooltip
                    id={tooltipId}
                    name={tool.label}
                    description={tool.description}
                    shortcut={tool.shortcut}
                    icon={tool.icon}
                  />
                )}
                {showStylePicker && (
                  <div
                    role="radiogroup"
                    aria-label={`${tool.label} stroke style`}
                    className="flex gap-1 px-2.5 pb-1 pt-0.5"
                  >
                    {STROKE_STYLES.map((s) => (
                      <button
                        key={s.id}
                        role="radio"
                        aria-checked={styleValue === s.id}
                        onClick={() => setStyle(s.id)}
                        className={`flex-1 px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                          styleValue === s.id
                            ? 'bg-[color:var(--color-blueprint-strong)] text-white border-[color:var(--color-blueprint-strong)]'
                            : 'bg-[color:var(--color-paper-raised)] dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-[color:var(--color-paper-line)] dark:border-gray-700 hover:border-gray-400'
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
      ))}
    </div>
  )
}
