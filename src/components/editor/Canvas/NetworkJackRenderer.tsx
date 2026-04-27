import { Group, Rect, Line } from 'react-konva'
import type { NetworkJackElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  element: NetworkJackElement
}

/**
 * Network jack (RJ45 wall outlet) renderer.
 *
 * Visual identity is a tiny soft-grey square with two short tabs at
 * the top — a stylised RJ45 silhouette. Real jacks are small physical
 * objects (an inch or two on a side) so the default 18×18 footprint
 * preserves the count-and-position-over-bulk reading of the floor
 * plan. The tabs telegraph "RJ45" without drawing the eight contact
 * pins, which would dissolve into noise at typical zoom.
 *
 * Status:
 *   - `'broken'`  red stroke so a dead jack is visible at a glance.
 *   - `'planned'` dashed outline.
 *
 * No label is drawn — at 18×18 the silhouette IS the identifier; the
 * `jackId` surfaces in the M2 properties panel + M3 devices panel.
 */
export function NetworkJackRenderer({ element }: Props) {
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

  // Tab dimensions — short stubs above the body that read as RJ45
  // contact tabs. Width is ~18% of the body; height is small + clamped
  // so the tabs don't disappear at minimum size or balloon at large.
  const tabW = Math.max(2, w * 0.18)
  const tabH = Math.max(1.5, h * 0.18)

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {/* Two short tabs at the top — drawn first so the body's stroke
       *  paints over their seam, leaving a clean silhouette. */}
      <Rect
        x={-w / 2 + w * 0.2}
        y={-h / 2 - tabH}
        width={tabW}
        height={tabH}
        fill={baseStroke}
        opacity={element.style.opacity * 0.8}
        listening={false}
      />
      <Rect
        x={w / 2 - w * 0.2 - tabW}
        y={-h / 2 - tabH}
        width={tabW}
        height={tabH}
        fill={baseStroke}
        opacity={element.style.opacity * 0.8}
        listening={false}
      />
      {/* Main jack body — slight corner radius, soft grey fill, darker
       *  grey stroke. */}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={element.style.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={2}
        opacity={element.style.opacity}
        dash={dash}
      />
      {/* Inner port slot — a thin horizontal line near the bottom of
       *  the body, suggesting the cable opening. Helps disambiguate
       *  the jack from a generic small square at first glance. */}
      <Line
        points={[-w / 2 + w * 0.25, h / 2 - h * 0.3, w / 2 - w * 0.25, h / 2 - h * 0.3]}
        stroke={baseStroke}
        strokeWidth={Math.max(0.75, h * 0.08)}
        opacity={element.style.opacity * 0.6}
        listening={false}
      />
    </Group>
  )
}
