import { Group, Rect } from 'react-konva'
import type { PrinterElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'

interface Props {
  element: PrinterElement
}

/**
 * Printer renderer — rectangular body with a thin paper-tray slot near
 * the top edge. The tray is a contrasting inset rect, kept proportional
 * to the body so it remains legible after resizes.
 */
export function PrinterRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  const w = element.width
  const h = element.height
  // Tray spans the inner 80% of width, ~15% tall, offset ~25% from the top
  // so it reads as "slot" not "belt".
  const trayW = w * 0.8
  const trayH = Math.max(3, h * 0.15)
  const trayY = -h / 2 + h * 0.25

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={element.style.fill}
        stroke={isSelected ? '#3B82F6' : element.style.stroke}
        strokeWidth={isSelected ? 2.5 : element.style.strokeWidth}
        cornerRadius={2}
        opacity={element.style.opacity}
      />
      {/* Paper tray indicator */}
      <Rect
        x={-trayW / 2}
        y={trayY}
        width={trayW}
        height={trayH}
        fill="#FFFFFF"
        stroke={element.style.stroke}
        strokeWidth={0.75}
        opacity={element.style.opacity}
        listening={false}
      />
    </Group>
  )
}
