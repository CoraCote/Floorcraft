import { Rect, Line } from 'react-konva'
import type { DecorElement } from '../../../../types/elements'

export function DecorElevator({ element }: { element: DecorElement }) {
  const w = element.width, h = element.height
  return (
    <>
      <Rect x={0} y={0} width={w} height={h}
        fill={element.style.fill}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
      />
      <Line points={[w * 0.2, h * 0.2, w * 0.8, h * 0.8]} stroke={element.style.stroke} strokeWidth={2} />
      <Line points={[w * 0.8, h * 0.2, w * 0.2, h * 0.8]} stroke={element.style.stroke} strokeWidth={2} />
    </>
  )
}
