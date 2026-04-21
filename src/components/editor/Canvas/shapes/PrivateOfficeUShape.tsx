import { Line, Text } from 'react-konva'
import type { PrivateOfficeElement } from '../../../../types/elements'

export function PrivateOfficeUShape({ element }: { element: PrivateOfficeElement }) {
  const w = element.width
  const h = element.height
  const thick = Math.min(w, h) * 0.25
  const pts = [
    0, 0,
    thick, 0,
    thick, h - thick,
    w - thick, h - thick,
    w - thick, 0,
    w, 0,
    w, h,
    0, h,
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
          x={0} y={h / 2 - 6} width={w} align="center"
          text={element.label} fontSize={11} fill="#111827"
        />
      )}
    </>
  )
}
