import { Line } from 'react-konva'
import type { LineShapeElement } from '../../../../types/elements'
import { useUIStore } from '../../../../stores/uiStore'

interface Props {
  element: LineShapeElement
}

/**
 * Line uses absolute world coords via `points` (mirror of WallRenderer) so
 * the wrapping Group must be anchored at (0, 0). ElementRenderer reads
 * `isLineShapeElement` for this branch.
 */
export function LineShapeRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const sw = element.style.strokeWidth || 2

  let dash: number[] | undefined
  if (element.dashStyle === 'dashed') dash = [sw * 3, sw * 2]
  else if (element.dashStyle === 'dotted') dash = [0.1, sw * 2]

  return (
    <Line
      points={element.points}
      stroke={isSelected ? '#3B82F6' : element.style.stroke}
      strokeWidth={isSelected ? Math.max(sw, 2.5) : sw}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={Math.max(12, sw + 6)}
      dash={dash}
      opacity={element.style.opacity}
    />
  )
}
