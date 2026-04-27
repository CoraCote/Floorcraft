import { Group, Rect, Circle } from 'react-konva'
import type { OutletElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  element: OutletElement
}

/**
 * Outlet / receptacle renderer.
 *
 * Visual identity is the standard US duplex outlet glyph: two parallel
 * vertical slot rectangles (the hot/neutral prongs) and a smaller
 * circle below them (the ground hole). The default orientation is
 * vertical (16×24) so the silhouette matches the way an outlet appears
 * on an architectural wall — slots tall, ground at the bottom.
 *
 * Status:
 *   - `'broken'`  red stroke (a dead outlet is a real-world hazard,
 *                 calling it out at the silhouette level matters).
 *   - `'planned'` dashed outline.
 *
 * No center dot or label — the silhouette is information-dense enough
 * already, and at 16×24 a label would compete with the slots. Circuit
 * + voltage details surface in M2's properties panel.
 */
export function OutletRenderer({ element }: Props) {
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

  // Slot dimensions — narrow vertical rectangles. Width is ~10% of
  // the body (so two slots + spacing fit comfortably); height is ~30%
  // of the body so the slots dominate the upper portion. Clamped to
  // legibility minimums.
  const slotW = Math.max(1, w * 0.1)
  const slotH = Math.max(2, h * 0.3)
  const slotY = -h / 2 + h * 0.18
  const slotXOff = w * 0.18

  // Ground circle — placed below the slots, ~1/4 of the way up from
  // the bottom edge.
  const groundR = Math.max(1.2, Math.min(w, h) * 0.1)
  const groundY = h / 2 - h * 0.22

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {/* Outer plate — slight corner radius to match the rounded
       *  cover plate of a real US duplex outlet. */}
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
      {/* Left slot */}
      <Rect
        x={-slotXOff - slotW / 2}
        y={slotY}
        width={slotW}
        height={slotH}
        fill={baseStroke}
        opacity={element.style.opacity * 0.85}
        cornerRadius={0.5}
        listening={false}
      />
      {/* Right slot */}
      <Rect
        x={slotXOff - slotW / 2}
        y={slotY}
        width={slotW}
        height={slotH}
        fill={baseStroke}
        opacity={element.style.opacity * 0.85}
        cornerRadius={0.5}
        listening={false}
      />
      {/* Ground hole — small circle below the prongs. */}
      <Circle
        x={0}
        y={groundY}
        radius={groundR}
        fill={baseStroke}
        opacity={element.style.opacity * 0.85}
        listening={false}
      />
    </Group>
  )
}
