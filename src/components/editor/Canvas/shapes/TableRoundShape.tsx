import { Circle, Text } from 'react-konva'
import type { TableElement } from '../../../../types/elements'

export function TableRoundShape({ element }: { element: TableElement }) {
  const r = Math.min(element.width, element.height) / 2
  return (
    <>
      <Circle
        x={element.width / 2}
        y={element.height / 2}
        radius={r}
        fill={element.style.fill}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
        opacity={element.style.opacity}
      />
      {element.label && (
        <Text
          x={0}
          y={element.height / 2 - 8}
          width={element.width}
          align="center"
          text={element.label}
          fontSize={12}
          fill="#111827"
        />
      )}
    </>
  )
}
