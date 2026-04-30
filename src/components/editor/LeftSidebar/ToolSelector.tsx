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
  description: string
}

/**
 * Wave 21A — Drafting Studio tool rail.
 *
 * The previous tool selector was a 260-px vertical list of icon + label +
 * shortcut rows, which spent its width re-stating each tool's name. The
 * rail collapses that into a 56-px icon-only column (Figma / Excalidraw
 * idiom): hover yields a rich first-use tooltip on first encounter and
 * a native title-attribute tooltip thereafter. Tools cluster into four
 * groups separated by hairlines so the eye groups them by intent
 * rather than scanning a flat list of thirteen items.
 *
 * Hover discovery scales with the operator's familiarity:
 *   - First time the operator hovers a tool: rich `FirstUseTooltip`
 *     card with name, description, and shortcut.
 *   - Subsequent hovers: native title attribute as a quiet reminder.
 *   - Keyboard shortcuts in the existing `useKeyboardShortcuts` hook
 *     are unchanged — the rail is a pointer affordance, not the
 *     authoritative tool surface.
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

const WALL_STYLES: { id: WallDrawStyle; label: string }[] = [
  { id: 'solid', label: 'S' },
  { id: 'dashed', label: '⋯' },
  { id: 'dotted', label: '·' },
]

export function ToolSelector() {
  const activeTool = useCanvasStore((s) => s.activeTool)
  const setActiveTool = useCanvasStore((s) => s.setActiveTool)
  const wallDrawStyle = useCanvasStore((s) => s.wallDrawStyle)
  const setWallDrawStyle = useCanvasStore((s) => s.setWallDrawStyle)
  const canEdit = useCan('editMap')
  const { showRichTooltip, markToolUsed } = useFirstUseTooltip()
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

  const handleToolClick = (tool: ToolDef) => {
    setActiveTool(tool.id)
    markToolUsed(tool.id)
  }

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
            const isRich = hoveredToolId === tool.id && showRichTooltip(tool.id)
            const tooltipId = `first-use-tooltip-${tool.id}`
            const isActive = activeTool === tool.id
            return (
              <div key={tool.id} className={`relative ${isRich ? 'z-10' : ''}`}>
                <button
                  onClick={() => handleToolClick(tool)}
                  onMouseEnter={() => setHoveredToolId(tool.id)}
                  onMouseLeave={() => setHoveredToolId((p) => (p === tool.id ? null : p))}
                  onFocus={() => setHoveredToolId(tool.id)}
                  onBlur={() => setHoveredToolId((p) => (p === tool.id ? null : p))}
                  className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${
                    isActive
                      ? 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800'
                  }`}
                  title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                  aria-label={tool.label}
                  aria-pressed={isActive}
                  aria-describedby={isRich ? tooltipId : undefined}
                >
                  {tool.icon}
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
                {/* Wall-style flyout only renders under the wall icon
                    when the wall tool is active. Three compact pills
                    in a row — the rail's vertical column flow tolerates
                    the brief horizontal break. */}
                {tool.id === 'wall' && isActive && (
                  <div
                    role="radiogroup"
                    aria-label="Wall line style"
                    className="mt-1 mb-1 flex items-center justify-center gap-0.5 px-0.5"
                  >
                    {WALL_STYLES.map((s) => (
                      <button
                        key={s.id}
                        role="radio"
                        aria-checked={wallDrawStyle === s.id}
                        onClick={() => setWallDrawStyle(s.id)}
                        className={`h-5 w-6 rounded text-[10px] font-mono transition-colors ${
                          wallDrawStyle === s.id
                            ? 'bg-[color:var(--color-blueprint)] text-white'
                            : 'bg-[color:var(--color-paper-sunken)] text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-[color:var(--color-paper-line)] dark:hover:bg-gray-700'
                        }`}
                        title={`${s.id} wall style`}
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
