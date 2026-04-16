import { Rect, Arc } from 'react-konva'
import type { DecorElement } from '../../../../types/elements'

export function DecorReception({ element }: { element: DecorElement }) {
  const w = element.width, h = element.height
  return (
    <>
      <Arc x={w / 2} y={h}
        innerRadius={Math.min(w, h * 2) * 0.35}
        outerRadius={Math.min(w, h * 2) * 0.5}
        angle={180}
        rotation={180}
        fill={element.style.fill}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
      />
      <Rect x={0} y={h * 0.7} width={w} height={h * 0.3}
        fill={element.style.fill}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
      />
    </>
  )
}
