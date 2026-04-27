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

  // Leaflets — small offset circles that overlap the main foliage so
  // the plant reads as "bushy" instead of a single flat blob. Their
  // sizes are derived from `foliageR` so they scale with the element.
  const leafR = Math.max(3, foliageR * 0.55)
  const cy = -h / 2 + foliageR

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {/* Foliage — three offset circles forming a clover-like shape so
       * the silhouette reads as foliage rather than a perfect circle.
       * The main circle anchors at element-center; two leaflets sit
       * slightly up-left and up-right, each darker than the main fill
       * for a hand-drawn / "leafy" feel. */}
      <Circle
        x={-foliageR * 0.45}
        y={cy - foliageR * 0.15}
        radius={leafR}
        fill={element.style.fill}
        opacity={element.style.opacity * 0.85}
        listening={false}
      />
      <Circle
        x={foliageR * 0.45}
        y={cy - foliageR * 0.15}
        radius={leafR}
        fill={element.style.fill}
        opacity={element.style.opacity * 0.85}
        listening={false}
      />
      <Circle
        x={0}
        y={cy}
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
      {/* Pot rim — slightly darker stripe along the top of the pot so
       * the silhouette has a clear "pot vs foliage" boundary. */}
      <Rect
        x={-w / 2 + w * 0.2}
        y={h / 2 - potH}
        width={w * 0.6}
        height={Math.max(1, potH * 0.2)}
        fill="#000"
        opacity={element.style.opacity * 0.18}
        listening={false}
      />
    </Group>
  )
}
