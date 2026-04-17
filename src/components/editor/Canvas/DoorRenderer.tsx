import { Group, Line, Arc, Rect } from 'react-konva'
import type { DoorElement } from '../../../types/elements'
import { useElementsStore } from '../../../stores/elementsStore'
import { useUIStore } from '../../../stores/uiStore'
import { isWallElement } from '../../../types/elements'
import {
  wallSegments,
  locateOnStraightSegments,
  tangentAt,
} from '../../../lib/wallPath'

interface DoorRendererProps {
  element: DoorElement
}

/**
 * Render a door positioned along its parent wall.
 *
 * We resolve the door's parametric `positionOnWall` (measured along the
 * wall's straight-segment concatenation — see `locateOnStraightSegments`)
 * to a concrete point + tangent each render. This avoids storing a cached
 * world-space position that would go stale whenever the wall moves. If the
 * parent wall is missing or the position lands on a non-straight segment,
 * we fall back to rendering at the door's own (x, y).
 *
 * Geometry:
 *   - A horizontal rectangle of width = element.width and a thin stroke
 *     represents the door opening in the wall.
 *   - An `Arc` sketches the swing, rotated to match `swingDirection`.
 *   - The whole group is rotated to align the door "opening" with the
 *     wall's local tangent direction.
 */
export function DoorRenderer({ element }: DoorRendererProps) {
  const parentWall = useElementsStore(
    (s) => s.elements[element.parentWallId],
  )
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)

  // Resolve position + tangent from parent wall.
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
  const fill = isSelected ? '#EFF6FF' : element.style.fill

  // Swing arc: quarter-circle whose hinge is at the door's left edge for
  // 'left' / 'both', right edge for 'right'. We render in local coords then
  // let the Group rotate the whole thing to match the wall tangent.
  const radius = w
  const swingFill = 'rgba(59, 130, 246, 0.08)'
  const swingStroke = isSelected ? '#3B82F6' : '#94A3B8'

  return (
    <Group x={cx} y={cy} rotation={rotationDeg}>
      {/* The wall-gap "frame" behind the door panel. */}
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Door panel drawn as a short line flush along the opening. */}
      <Line
        points={[-w / 2, 0, w / 2, 0]}
        stroke={stroke}
        strokeWidth={2}
      />
      {/* Swing indicator. Use two arcs when swingDirection === 'both'. */}
      {(element.swingDirection === 'left' ||
        element.swingDirection === 'both') && (
        <Arc
          x={-w / 2}
          y={0}
          innerRadius={0}
          outerRadius={radius}
          angle={element.openAngle}
          rotation={-element.openAngle}
          fill={swingFill}
          stroke={swingStroke}
          strokeWidth={1}
          dash={[4, 4]}
        />
      )}
      {(element.swingDirection === 'right' ||
        element.swingDirection === 'both') && (
        <Arc
          x={w / 2}
          y={0}
          innerRadius={0}
          outerRadius={radius}
          angle={element.openAngle}
          rotation={180}
          fill={swingFill}
          stroke={swingStroke}
          strokeWidth={1}
          dash={[4, 4]}
        />
      )}
    </Group>
  )
}
