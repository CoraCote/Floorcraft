import { Group, Circle, Rect } from 'react-konva'
import type { PlantElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  element: PlantElement
}

/**
 * Plant renderer — a green foliage circle resting on a darker pot base.
 * The base is a thin rect at the bottom so the silhouette reads as "plant
 * in a pot" even at small sizes; the foliage fills most of the bounds.
 */
export function PlantRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  const w = element.width
  const h = element.height
  // Pot takes the bottom ~25% of the bounds. Radius is driven off the
  // smaller dimension so non-square bounds (if the user resizes) still
  // render a circle instead of an ellipse.
  const potH = Math.max(4, h * 0.25)
  const foliageR = Math.min(w, h - potH) / 2

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {/* Foliage */}
      <Circle
        x={0}
        y={-h / 2 + foliageR}
        radius={foliageR}
        fill={element.style.fill}
        stroke={isSelected ? '#3B82F6' : element.style.stroke}
        strokeWidth={isSelected ? 2.5 : element.style.strokeWidth}
        opacity={element.style.opacity}
      />
      {/* Pot base */}
      <Rect
        x={-w / 2 + w * 0.2}
        y={h / 2 - potH}
        width={w * 0.6}
        height={potH}
        fill={element.style.stroke}
        opacity={element.style.opacity}
        cornerRadius={[0, 0, 2, 2]}
        listening={false}
      />
    </Group>
  )
}
