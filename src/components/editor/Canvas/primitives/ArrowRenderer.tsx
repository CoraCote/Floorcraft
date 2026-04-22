import { Arrow } from 'react-konva'
import type { ArrowElement } from '../../../../types/elements'
import { useUIStore } from '../../../../stores/uiStore'

interface Props {
  element: ArrowElement
}

export function ArrowRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const sw = element.style.strokeWidth || 2

  let dash: number[] | undefined
  if (element.dashStyle === 'dashed') dash = [sw * 3, sw * 2]
  else if (element.dashStyle === 'dotted') dash = [0.1, sw * 2]

  return (
    <Arrow
      points={element.points}
      stroke={isSelected ? '#3B82F6' : element.style.stroke}
      fill={isSelected ? '#3B82F6' : (element.style.fill || element.style.stroke)}
      strokeWidth={isSelected ? Math.max(sw, 2.5) : sw}
      pointerLength={Math.max(10, sw * 3)}
      pointerWidth={Math.max(10, sw * 3)}
      hitStrokeWidth={Math.max(12, sw + 6)}
      dash={dash}
      opacity={element.style.opacity}
    />
  )
}
