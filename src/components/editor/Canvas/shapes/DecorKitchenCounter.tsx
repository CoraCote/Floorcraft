import { Rect, Circle } from 'react-konva'
import type { DecorElement } from '../../../../types/elements'

export function DecorKitchenCounter({ element }: { element: DecorElement }) {
  const w = element.width, h = element.height
  return (
    <>
      <Rect x={0} y={0} width={w} height={h}
        fill={element.style.fill}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
      />
      <Circle x={w * 0.25} y={h / 2} radius={Math.min(w, h) * 0.08} fill="#64748B" />
      <Circle x={w * 0.75} y={h / 2} radius={Math.min(w, h) * 0.08} fill="#64748B" />
    </>
  )
}
