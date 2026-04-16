import { Rect } from 'react-konva'
import type { DecorElement } from '../../../../types/elements'

export function DecorArmchair({ element }: { element: DecorElement }) {
  const w = element.width, h = element.height
  return (
    <>
      <Rect x={0} y={0} width={w} height={h} cornerRadius={6}
        fill={element.style.stroke} stroke={element.style.stroke} strokeWidth={1} />
      <Rect x={w * 0.1} y={h * 0.2} width={w * 0.8} height={h * 0.65} cornerRadius={4}
        fill={element.style.fill} stroke={element.style.stroke} strokeWidth={element.style.strokeWidth} />
    </>
  )
}
