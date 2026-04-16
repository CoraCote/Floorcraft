import { Rect } from 'react-konva'
import type { DecorElement } from '../../../../types/elements'

export function DecorCouch({ element }: { element: DecorElement }) {
  const w = element.width, h = element.height
  return (
    <>
      <Rect x={0} y={0} width={w} height={h} cornerRadius={8}
        fill={element.style.stroke} />
      <Rect x={w * 0.05} y={h * 0.25} width={w * 0.9} height={h * 0.55} cornerRadius={6}
        fill={element.style.fill} stroke={element.style.stroke} strokeWidth={element.style.strokeWidth} />
    </>
  )
}
