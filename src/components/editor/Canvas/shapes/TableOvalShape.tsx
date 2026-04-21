import { Ellipse, Text } from 'react-konva'
import type { TableElement } from '../../../../types/elements'

export function TableOvalShape({ element }: { element: TableElement }) {
  return (
    <>
      <Ellipse
        x={element.width / 2}
        y={element.height / 2}
        radiusX={element.width / 2}
        radiusY={element.height / 2}
        fill={element.style.fill}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
        opacity={element.style.opacity}
      />
      {element.label && (
        <Text
          x={0} y={element.height / 2 - 8}
          width={element.width} align="center"
          text={element.label} fontSize={12} fill="#111827"
        />
      )}
    </>
  )
}
