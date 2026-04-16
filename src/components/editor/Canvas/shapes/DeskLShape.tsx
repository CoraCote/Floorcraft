import { Line, Text } from 'react-konva'
import type { DeskElement } from '../../../../types/elements'

export function DeskLShape({ element }: { element: DeskElement }) {
  const w = element.width
  const h = element.height
  const armThick = Math.min(w, h) * 0.4
  const pts = [
    0, 0,
    w, 0,
    w, h,
    w - armThick, h,
    w - armThick, armThick,
    0, armThick,
    0, 0,
  ]
  return (
    <>
      <Line
        points={pts}
        closed
        fill={element.style.fill}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
        opacity={element.style.opacity}
      />
      {element.label && (
        <Text
          x={4} y={armThick / 2 - 6}
          text={element.label} fontSize={11} fill="#111827"
        />
      )}
    </>
  )
}
