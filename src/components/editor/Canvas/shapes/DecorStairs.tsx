import { Rect, Line } from 'react-konva'
import type { DecorElement } from '../../../../types/elements'

export function DecorStairs({ element }: { element: DecorElement }) {
  const w = element.width, h = element.height
  const steps = 5
  const stepH = h / steps
  const lines = []
  for (let i = 1; i < steps; i++) {
    lines.push(<Line key={i} points={[0, i * stepH, w, i * stepH]} stroke={element.style.stroke} strokeWidth={1} />)
  }
  return (
    <>
      <Rect x={0} y={0} width={w} height={h}
        fill={element.style.fill}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
      />
      {lines}
    </>
  )
}
