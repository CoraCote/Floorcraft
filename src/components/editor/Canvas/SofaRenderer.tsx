import { Group, Rect } from 'react-konva'
import type { SofaElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  element: SofaElement
}

/**
 * Sofa renderer — a rounded main body with two inset armrest bars. The
 * armrests are proportional (clamped so very narrow sofas still read as
 * "sofa" instead of "block"), which keeps the silhouette recognisable
 * after the user resizes.
 */
export function SofaRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  const w = element.width
  const h = element.height
  // Armrest width is ~10% of body width, clamped to a 6–24px range so it
  // stays visible when shrunk and doesn't eat the sofa when enlarged.
  const armW = Math.max(6, Math.min(24, w * 0.1))
  const stroke = isSelected ? '#3B82F6' : element.style.stroke
  const strokeWidth = isSelected ? 2.5 : element.style.strokeWidth

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {/* Main cushion body */}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={element.style.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={Math.min(12, h / 3)}
        opacity={element.style.opacity}
      />
      {/* Left armrest */}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={armW}
        height={h}
        fill={element.style.stroke}
        opacity={element.style.opacity * 0.35}
        cornerRadius={[6, 0, 0, 6]}
        listening={false}
      />
      {/* Right armrest */}
      <Rect
        x={w / 2 - armW}
        y={-h / 2}
        width={armW}
        height={h}
        fill={element.style.stroke}
        opacity={element.style.opacity * 0.35}
        cornerRadius={[0, 6, 6, 0]}
        listening={false}
      />
    </Group>
  )
}
