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
 * Drafting Studio tool rail.
 *
 * Hover model: a rich tooltip card (name + description + shortcut)
 * appears next to the icon on EVERY hover, not just the first. The
 * previous "first-use only" gate left experienced operators with a
 * tiny native title tooltip that didn't explain what each tool did
 * — confusing for power users coming back to a feature they used
 * once. The native `title` attribute is also set as a belt-and-
 * braces fallback for screen readers / keyboard-only nav.
 *
 * Wall + Line + Arrow each carry an inline three-pill style picker
 * (solid / dashed / dotted) that appears below the active tool's
 * icon. Stays in the canvas store so the choice survives a tool
 * switch.
 *
 * Keyboard shortcuts in `useKeyboardShortcuts` are unchanged — the
 * rail is a pointer affordance, not the authoritative tool surface.
 */

type ToolGroup = ReadonlyArray<ToolDef>

const NAV_GROUP: ToolGroup = [
  {
    id: 'select',
    label: 'Select',
    icon: <MousePointer2 size={18} aria-hidden="true" />,
    shortcut: 'V',
    description: 'Click an element to select, drag empty canvas to pan, Shift+drag to lasso.',
  },
  {
    id: 'pan',
    label: 'Pan',
    icon: <Hand size={18} aria-hidden="true" />,
    shortcut: 'Space',
    description: 'Dedicated pan mode. Hold Space anywhere for a temporary pan instead.',
  },
]

const ARCHITECTURE_GROUP: ToolGroup = [
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
  {
    id: 'room',
    label: 'Room',
    icon: <Square size={18} aria-hidden="true" />,
    shortcut: '⇧O',
    description: 'Click and drag to draw a 4-wall rectangular room. Hold Shift for a square.',
  },
]

const SHAPE_GROUP: ToolGroup = [
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
    description: 'Click and drag to draw a straight line. Pick solid, dashed, or dotted from the style flyout.',
  },
  {
    id: 'arrow',
    label: 'Arrow',
    icon: <ArrowRight size={18} aria-hidden="true" />,
    shortcut: 'A',
    description: 'Click and drag to draw an arrow. Solid, dashed, or dotted via the style flyout.',
  },
  {
    id: 'free-text',
    label: 'Text',
    icon: <Type size={18} aria-hidden="true" />,
    shortcut: 'T',
    description: 'Click anywhere to drop a text label on the canvas.',
  },
]

const MEASURE_GROUP: ToolGroup = [
  {
    id: 'measure',
    label: 'Measure',
    icon: <Ruler size={18} aria-hidden="true" />,
    shortcut: '⇧M',
    description: 'Click points to measure distance. Double-click or Enter to finish.',
  },
  {
    id: 'neighborhood',
    label: 'Neighborhood',
    icon: <MapPin size={18} aria-hidden="true" />,
    shortcut: '⇧G',
    description: 'Drag on empty canvas to paint a labeled zone for a team or group.',
  },
]

const GROUPS = [NAV_GROUP, ARCHITECTURE_GROUP, SHAPE_GROUP, MEASURE_GROUP] as const

const STROKE_STYLES: Array<{
  id: WallDrawStyle | LineDrawStyle
  label: string
  title: string
}> = [
  { id: 'solid', label: 'S', title: 'Solid' },
  { id: 'dashed', label: '⋯', title: 'Dashed' },
  { id: 'dotted', label: '·', title: 'Dotted' },
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

  // Viewers see only navigation (select, pan) and the read-only measure
  // tool — the rest would be silent no-ops against `canEdit` guards.
  const visibleGroups: ReadonlyArray<ToolGroup> = canEdit
    ? GROUPS
    : [
        NAV_GROUP,
        // Pull measure out of MEASURE_GROUP since neighborhood is edit-only.
        [MEASURE_GROUP[0]] as ToolGroup,
      ]

  return (
    <div className="py-2 flex flex-col items-center gap-1">
      {visibleGroups.map((group, gi) => (
        <div key={gi} className="flex flex-col items-center gap-1 w-full">
          {gi > 0 && (
            <div
              aria-hidden="true"
              className="my-1 h-px w-7 bg-[color:var(--color-paper-line)] dark:bg-gray-700"
            />
          )}
          {group.map((tool) => {
            const isHovered = hoveredToolId === tool.id
            const tooltipId = `tool-tooltip-${tool.id}`
            const isActive = activeTool === tool.id
            const showStylePicker =
              isActive && (tool.id === 'wall' || tool.id === 'line-shape' || tool.id === 'arrow')
            const styleValue =
              tool.id === 'wall' ? wallDrawStyle : lineDrawStyle
            const setStyle =
              tool.id === 'wall' ? setWallDrawStyle : setLineDrawStyle
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
                  className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${
                    isActive
                      ? 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800'
                  }`}
                  // Native title tooltip as a belt-and-braces fallback for
                  // screen readers / keyboard-only nav. The rich card is
                  // the primary affordance for sighted operators.
                  title={tool.shortcut ? `${tool.label} (${tool.shortcut}) — ${tool.description}` : `${tool.label} — ${tool.description}`}
                  aria-label={tool.label}
                  aria-pressed={isActive}
                  aria-describedby={isHovered ? tooltipId : undefined}
                >
                  {tool.icon}
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
                    className="mt-1 mb-1 flex items-center justify-center gap-0.5 px-0.5"
                  >
                    {STROKE_STYLES.map((s) => (
                      <button
                        key={s.id}
                        role="radio"
                        aria-checked={styleValue === s.id}
                        onClick={() => setStyle(s.id)}
                        className={`h-5 w-6 rounded text-[10px] font-mono transition-colors ${
                          styleValue === s.id
                            ? 'bg-[color:var(--color-blueprint)] text-white'
                            : 'bg-[color:var(--color-paper-sunken)] text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-[color:var(--color-paper-line)] dark:hover:bg-gray-700'
                        }`}
                        title={`${s.title} stroke`}
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
