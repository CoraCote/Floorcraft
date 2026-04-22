import { Ellipse, Group } from 'react-konva'
import type { EllipseElement } from '../../../../types/elements'
import { useUIStore } from '../../../../stores/uiStore'

interface Props {
  element: EllipseElement
}

export function EllipseRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Ellipse
        x={0}
        y={0}
        radiusX={element.width / 2}
        radiusY={element.height / 2}
        fill={element.style.fill}
        stroke={isSelected ? '#3B82F6' : element.style.stroke}
        strokeWidth={isSelected ? Math.max(element.style.strokeWidth, 2.5) : element.style.strokeWidth}
        opacity={element.style.opacity}
      />
    </Group>
  )
}
