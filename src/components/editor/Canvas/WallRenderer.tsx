import { Path } from 'react-konva'
import type { WallElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { wallPathData } from '../../../lib/wallPath'

interface WallRendererProps {
  element: WallElement
}

/**
 * Render a wall as a single <Path>. `wallPathData` already emits `L` commands
 * for straight (bulge === 0) segments and `A` commands for curved ones, so a
 * uniform <Path> handles both cases. Using a single primitive keeps the
 * Konva node identity stable across bulge changes — toggling between
 * different node types (e.g. <Line> ↔ <Path>) would force react-konva to
 * destroy and recreate the node, which disrupts the Transformer ref and any
 * in-flight drag. Hit-testing width is bumped so thin walls stay clickable.
 */
export function WallRenderer({ element }: WallRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const stroke = isSelected ? '#3B82F6' : element.style.stroke
  const hitStrokeWidth = Math.max(12, element.thickness + 6)

  return (
    <Path
      data={wallPathData(element.points, element.bulges)}
      stroke={stroke}
      strokeWidth={element.thickness}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={hitStrokeWidth}
      fillEnabled={false}
    />
  )
}
