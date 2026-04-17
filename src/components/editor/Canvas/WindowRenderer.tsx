import { Group, Rect, Line } from 'react-konva'
import type { WindowElement } from '../../../types/elements'
import { useElementsStore } from '../../../stores/elementsStore'
import { useUIStore } from '../../../stores/uiStore'
import { isWallElement } from '../../../types/elements'
import {
  wallSegments,
  locateOnStraightSegments,
  tangentAt,
} from '../../../lib/wallPath'

interface WindowRendererProps {
  element: WindowElement
}

/**
 * Render a window attached to its parent wall. Same position-resolution
 * strategy as DoorRenderer: we re-derive world coords + rotation from the
 * wall each render so windows ride along when their wall moves.
 */
export function WindowRenderer({ element }: WindowRendererProps) {
  const parentWall = useElementsStore(
    (s) => s.elements[element.parentWallId],
  )
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  let cx = element.x
  let cy = element.y
  let rotationDeg = element.rotation
  if (parentWall && isWallElement(parentWall)) {
    const located = locateOnStraightSegments(
      parentWall.points,
      parentWall.bulges,
      element.positionOnWall,
    )
    if (located) {
      const segs = wallSegments(parentWall.points, parentWall.bulges)
      const seg = segs[located.segmentIndex]
      if (seg) {
        cx = seg.x0 + (seg.x1 - seg.x0) * located.tInSegment
        cy = seg.y0 + (seg.y1 - seg.y0) * located.tInSegment
        const tangent = tangentAt(seg, located.tInSegment)
        rotationDeg = (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI
      }
    }
  }

  const w = element.width
  const h = Math.max(element.height, 2)
  const stroke = isSelected ? '#3B82F6' : element.style.stroke
  const fill = isSelected ? '#DBEAFE' : element.style.fill

  return (
    <Group x={cx} y={cy} rotation={rotationDeg}>
      {/* Window frame: thin rectangle in the wall's tangent direction. */}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Central glass-pane line = standard architectural window symbol. */}
      <Line
        points={[-w / 2, 0, w / 2, 0]}
        stroke={stroke}
        strokeWidth={1}
      />
    </Group>
  )
}
