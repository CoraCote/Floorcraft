import { Group, Rect, Circle, Line } from 'react-konva'
import type { BadgeReaderElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  element: BadgeReaderElement
}

/**
 * Badge-reader renderer.
 *
 * Visual identity is a vertical pill — the wall-mounted form factor
 * every keycard reader (HID Signo, Schlage, Brivo) shares — with a
 * horizontal "card slot" line about two-thirds down the body and a
 * tiny status LED dot near the top. The vertical orientation deliber-
 * ately CONTRASTS with the network jack's small square so the two
 * read as distinct things even when the user has both placed near a
 * doorway.
 *
 * Status:
 *   - `'broken'`  red stroke + red LED.
 *   - `'planned'` dashed outline.
 *   - default     green LED conveys "armed and online".
 *
 * No label inline — the door it controls (`controlsDoorLabel`) is
 * surfaced in the M2 properties panel; on a small icon a label would
 * fight the silhouette.
 */
export function BadgeReaderRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  const w = element.width
  const h = element.height
  const isBroken = element.deviceStatus === 'broken'
  const isPlanned = element.deviceStatus === 'planned'

  const baseStroke = isBroken ? '#DC2626' : element.style.stroke
  const stroke = isSelected ? '#3B82F6' : baseStroke
  const strokeWidth = isSelected ? 2 : element.style.strokeWidth
  const dash = isPlanned ? [3, 2] : undefined

  // Card slot — a horizontal line ~⅔ down the body, ~70% of the body
  // width. Stroke matches the body stroke so it integrates rather
  // than competing.
  const slotY = -h / 2 + h * 0.65
  const slotInset = w * 0.15

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {/* Pill body — full corner radius on the short axis so the top
       *  and bottom are rounded regardless of resize. */}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={element.style.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={Math.min(w / 2, 6)}
        opacity={element.style.opacity}
        dash={dash}
      />
      {/* Status LED — a small dot near the top of the body. */}
      <Circle
        x={0}
        y={-h / 2 + Math.max(3, h * 0.18)}
        radius={Math.max(1, w * 0.12)}
        fill={isBroken ? '#DC2626' : '#22C55E'}
        opacity={element.style.opacity}
        listening={false}
      />
      {/* Card slot — short horizontal stripe. Drawn as a Line for
       *  cleaner anti-aliasing than a Rect at small heights. */}
      <Line
        points={[-w / 2 + slotInset, slotY, w / 2 - slotInset, slotY]}
        stroke={baseStroke}
        strokeWidth={Math.max(1, h * 0.06)}
        opacity={element.style.opacity * 0.75}
        listening={false}
      />
    </Group>
  )
}
