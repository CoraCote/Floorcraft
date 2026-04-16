import { Group, Line, Path } from 'react-konva'
import type { WallElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { wallPathData } from '../../../lib/wallPath'

interface WallRendererProps {
  element: WallElement
}

export function WallRenderer({ element }: WallRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const stroke = isSelected ? '#3B82F6' : element.style.stroke
  const hitStrokeWidth = Math.max(12, element.thickness + 6)

  const hasAnyBulge = (element.bulges ?? []).some((b) => b !== 0)

  return (
    <Group>
      {hasAnyBulge ? (
        <Path
          data={wallPathData(element.points, element.bulges)}
          stroke={stroke}
          strokeWidth={element.thickness}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={hitStrokeWidth}
          fillEnabled={false}
        />
      ) : (
        <Line
          points={element.points}
          stroke={stroke}
          strokeWidth={element.thickness}
          lineCap="round"
          lineJoin="round"
          hitStrokeWidth={hitStrokeWidth}
        />
      )}
    </Group>
  )
}
