import { Fragment } from 'react'
import { Layer, Circle } from 'react-konva'
import type Konva from 'konva'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { isWallElement, type WallElement } from '../../../types/elements'
import { wallSegments, segmentMidpoint } from '../../../lib/wallPath'
import { applyBulgeFromDrag, applyVertexMove } from '../../../lib/wallEditing'

export function WallEditOverlay() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)

  const selectedWalls = selectedIds
    .map((id) => elements[id])
    .filter((el): el is WallElement => !!el && isWallElement(el))

  if (selectedWalls.length === 0) return null

  return (
    <Layer>
      {selectedWalls.map((wall) => {
        const segs = wallSegments(wall.points, wall.bulges)
        const vertexCount = wall.points.length / 2
        return (
          <Fragment key={wall.id}>
            {Array.from({ length: vertexCount }, (_, vi) => (
              <Circle
                key={`e-${vi}`}
                name="wall-endpoint-handle"
                x={wall.points[vi * 2]}
                y={wall.points[vi * 2 + 1]}
                radius={5}
                fill="#3B82F6"
                stroke="#ffffff"
                strokeWidth={2}
                draggable
                onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
                  const node = e.target
                  applyVertexMove(wall.id, vi, { x: node.x(), y: node.y() })
                }}
              />
            ))}
            {segs.map((seg, si) => {
              const mid = segmentMidpoint(seg)
              return (
                <Circle
                  key={`m-${si}`}
                  name="wall-midpoint-handle"
                  x={mid.x}
                  y={mid.y}
                  radius={5}
                  fill="#22C55E"
                  stroke="#ffffff"
                  strokeWidth={2}
                  draggable
                  onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
                    const node = e.target
                    applyBulgeFromDrag(wall.id, si, { x: node.x(), y: node.y() })
                  }}
                  onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                    // Re-snap the handle back onto the segment midpoint so
                    // the next drag starts from a consistent position.
                    const store = useElementsStore.getState()
                    const el = store.elements[wall.id]
                    if (el && isWallElement(el)) {
                      const fresh = wallSegments(el.points, el.bulges)[si]
                      if (fresh) {
                        const m = segmentMidpoint(fresh)
                        e.target.position({ x: m.x, y: m.y })
                      }
                    }
                  }}
                />
              )
            })}
          </Fragment>
        )
      })}
    </Layer>
  )
}
