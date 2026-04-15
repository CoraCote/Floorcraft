import { Group, Line } from 'react-konva'
import type { WallElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface WallRendererProps {
  element: WallElement
}

export function WallRenderer({ element }: WallRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  return (
    <Group>
      <Line
        points={element.points}
        stroke={isSelected ? '#3B82F6' : element.style.stroke}
        strokeWidth={element.thickness}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={12}
      />
    </Group>
  )
}
