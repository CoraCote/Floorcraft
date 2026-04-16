import { Group, Rect, Text } from 'react-konva'
import type { BaseElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface FurnitureRendererProps {
  element: BaseElement
}

export function FurnitureRenderer({ element }: FurnitureRendererProps) {
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
        strokeWidth={isSelected ? 2.5 : element.style.strokeWidth}
        cornerRadius={3}
        opacity={element.style.opacity}
      />
      <Text
        text={element.label}
        x={-element.width / 2}
        y={-6}
        width={element.width}
        align="center"
        fontSize={10}
        fill="#6B7280"
        listening={false}
      />
    </Group>
  )
}
