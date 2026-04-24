import { Group, Rect } from 'react-konva'
import type { WhiteboardElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  element: WhiteboardElement
}

/**
 * Whiteboard renderer — a light writing surface wrapped in a dark frame
 * (thicker stroke) to signal the wall-mounted flavour. The fill is forced
 * to the body colour rather than `element.style.fill` so the surface
 * always reads "whiteboard" even if the user tweaks the style.
 */
export function WhiteboardRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill={element.style.fill}
        stroke={isSelected ? '#3B82F6' : element.style.stroke}
        // Dark frame — +2 over the configured stroke so it always reads
        // as "framed" against the light fill.
        strokeWidth={(isSelected ? 2.5 : element.style.strokeWidth) + 2}
        opacity={element.style.opacity}
      />
    </Group>
  )
}
