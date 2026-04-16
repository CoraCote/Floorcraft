import { Rect } from 'react-konva'
import type { DecorElement } from '../../../../types/elements'

export function DecorColumn({ element }: { element: DecorElement }) {
  return (
    <Rect
      x={0} y={0}
      width={element.width} height={element.height}
      fill={element.style.fill}
      stroke={element.style.stroke}
      strokeWidth={element.style.strokeWidth}
    />
  )
}
