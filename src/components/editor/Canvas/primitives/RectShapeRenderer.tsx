import { Group, Rect } from 'react-konva'
import type { RectShapeElement } from '../../../../types/elements'
import { useUIStore } from '../../../../stores/uiStore'

interface Props {
  element: RectShapeElement
}

export function RectShapeRenderer({ element }: Props) {
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
        strokeWidth={isSelected ? Math.max(element.style.strokeWidth, 2.5) : element.style.strokeWidth}
        opacity={element.style.opacity}
      />
    </Group>
  )
}
