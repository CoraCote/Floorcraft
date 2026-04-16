import { Rect, Line, Text } from 'react-konva'
import type { DeskElement } from '../../../../types/elements'

export function DeskCubicleShape({ element }: { element: DeskElement }) {
  const w = element.width
  const h = element.height
  return (
    <>
      <Rect
        x={0} y={0} width={w} height={h}
        fill="transparent"
        stroke={element.style.stroke}
        strokeWidth={3}
        cornerRadius={4}
      />
      <Rect
        x={w * 0.1} y={h * 0.45}
        width={w * 0.8} height={h * 0.35}
        fill={element.style.fill}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
      />
      <Line
        points={[w * 0.25, h, w * 0.75, h]}
        stroke="#fff"
        strokeWidth={4}
      />
      {element.label && (
        <Text
          x={4} y={4}
          text={element.label} fontSize={11} fill="#111827"
        />
      )}
    </>
  )
}
