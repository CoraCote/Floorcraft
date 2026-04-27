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
      {/* Backrest stripe — a thin band along the top of the body so the
       * sofa silhouette reads as "back + cushion" rather than a flat
       * pill. The band sits inside the main body rect and uses the
       * stroke colour at moderate opacity so it picks up the sofa's
       * accent tone without re-introducing a hard line. */}
      <Rect
        x={-w / 2 + armW}
        y={-h / 2}
        width={w - armW * 2}
        height={Math.max(4, h * 0.28)}
        fill={element.style.stroke}
        opacity={element.style.opacity * 0.18}
        cornerRadius={[6, 6, 0, 0]}
        listening={false}
      />
      {/* Left armrest */}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={armW}
        height={h}
        fill={element.style.stroke}
        opacity={element.style.opacity * 0.6}
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
        opacity={element.style.opacity * 0.6}
        cornerRadius={[0, 6, 6, 0]}
        listening={false}
      />
      {/* Cushion seam — thin horizontal line halfway down the seat
       * area to suggest individual cushions. Subtle on purpose so it
       * doesn't dominate the silhouette. */}
      <Rect
        x={-w / 2 + armW + 2}
        y={-h / 2 + Math.max(4, h * 0.28) + 2}
        width={w - armW * 2 - 4}
        height={1}
        fill={element.style.stroke}
        opacity={element.style.opacity * 0.4}
        listening={false}
      />
    </Group>
  )
}
