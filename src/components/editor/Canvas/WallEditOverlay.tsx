import { Fragment, useRef } from 'react'
import { Layer, Circle } from 'react-konva'
import type Konva from 'konva'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { isWallElement, type WallElement } from '../../../types/elements'
import { wallSegments, segmentMidpoint } from '../../../lib/wallPath'
import { applyBulgeFromDrag, applyVertexMove } from '../../../lib/wallEditing'

/** Min canvas-unit travel before a handle drag is allowed to commit. Prevents
 *  a stray 1-pixel pointer jitter during a click from clobbering the wall. */
const HANDLE_DRAG_THRESHOLD_PX = 2
const HANDLE_DRAG_THRESHOLD_SQ = HANDLE_DRAG_THRESHOLD_PX * HANDLE_DRAG_THRESHOLD_PX

/**
 * Per-handle drag session metadata. Tracks the pointer where the drag began
 * (so we can apply a travel threshold before committing anything), the last
 * pointer position during the drag (so dragEnd can re-apply with the final
 * coordinate — a browser may fire dragEnd without a preceding dragMove), and
 * whether this drag session has already passed the threshold and paused the
 * zundo temporal middleware.
 */
interface HandleDragSession {
  startX: number
  startY: number
  lastX: number
  lastY: number
  armed: boolean
}

export function WallEditOverlay() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const elements = useElementsStore((s) => s.elements)

  // One ref per mounted handle keyed by a string like `${wallId}:e:${vi}` or
  // `${wallId}:m:${si}`. Stored in a single Map so we don't leak refs between
  // re-renders when the set of selected walls changes.
  const dragRef = useRef<Map<string, HandleDragSession>>(new Map())

  const selectedWalls = selectedIds
    .map((id) => elements[id])
    .filter((el): el is WallElement => !!el && isWallElement(el))

  if (selectedWalls.length === 0) return null

  /** Begin a handle drag: record the start pointer so move can threshold. */
  const beginDrag = (key: string, x: number, y: number) => {
    dragRef.current.set(key, {
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      armed: false,
    })
  }

  /**
   * Continue a drag: if we haven't passed the threshold yet, check it now.
   * Crossing the threshold pauses zundo so the stream of updateElement calls
   * during the drag produces ONE undo snapshot, not dozens. Returns true if
   * the caller should apply this update.
   */
  const tickDrag = (key: string, x: number, y: number): boolean => {
    const s = dragRef.current.get(key)
    if (!s) return false
    s.lastX = x
    s.lastY = y
    if (!s.armed) {
      const dx = x - s.startX
      const dy = y - s.startY
      if (dx * dx + dy * dy < HANDLE_DRAG_THRESHOLD_SQ) return false
      s.armed = true
      useElementsStore.temporal.getState().pause()
    }
    return true
  }

  /**
   * End a drag: resume zundo so a final snapshot captures the drag result,
   * then clear the session. Returns the last pointer seen (or the pointer
   * passed in if we never saw a move) so the caller can apply one final
   * update — guarding against browsers that fire dragEnd without dragMove.
   */
  const endDrag = (
    key: string,
    x: number,
    y: number,
  ): { pointer: { x: number; y: number }; armed: boolean } => {
    const s = dragRef.current.get(key)
    dragRef.current.delete(key)
    if (!s) return { pointer: { x, y }, armed: false }
    if (s.armed) {
      useElementsStore.temporal.getState().resume()
    }
    return {
      pointer: { x: s.lastX, y: s.lastY },
      armed: s.armed,
    }
  }

  return (
    <Layer>
      {selectedWalls.map((wall) => {
        const segs = wallSegments(wall.points, wall.bulges)
        const vertexCount = wall.points.length / 2
        return (
          <Fragment key={wall.id}>
            {Array.from({ length: vertexCount }, (_, vi) => {
              const key = `${wall.id}:e:${vi}`
              return (
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
                  onDragStart={(e: Konva.KonvaEventObject<DragEvent>) => {
                    const node = e.target
                    beginDrag(key, node.x(), node.y())
                  }}
                  onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
                    const node = e.target
                    if (tickDrag(key, node.x(), node.y())) {
                      applyVertexMove(
                        wall.id,
                        vi,
                        { x: node.x(), y: node.y() },
                        { shiftKey: !!e.evt?.shiftKey },
                      )
                    }
                  }}
                  onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                    const node = e.target
                    const { pointer, armed } = endDrag(key, node.x(), node.y())
                    if (armed) {
                      // Commit the drag result at the final pointer. This
                      // ensures dragEnd applies even if dragMove never fired
                      // or was throttled between the last move and release.
                      applyVertexMove(wall.id, vi, pointer, {
                        shiftKey: !!e.evt?.shiftKey,
                      })
                    } else {
                      // Sub-threshold: treat as a click — snap the handle
                      // back to the vertex so the next drag starts clean.
                      const fresh = useElementsStore.getState().elements[wall.id]
                      if (fresh && isWallElement(fresh)) {
                        node.position({
                          x: fresh.points[vi * 2],
                          y: fresh.points[vi * 2 + 1],
                        })
                      }
                    }
                  }}
                />
              )
            })}
            {segs.map((seg, si) => {
              const mid = segmentMidpoint(seg)
              const key = `${wall.id}:m:${si}`
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
                  onDragStart={(e: Konva.KonvaEventObject<DragEvent>) => {
                    const node = e.target
                    beginDrag(key, node.x(), node.y())
                  }}
                  onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
                    const node = e.target
                    if (tickDrag(key, node.x(), node.y())) {
                      applyBulgeFromDrag(wall.id, si, {
                        x: node.x(),
                        y: node.y(),
                      })
                    }
                  }}
                  onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
                    const node = e.target
                    const { pointer, armed } = endDrag(key, node.x(), node.y())
                    if (armed) {
                      applyBulgeFromDrag(wall.id, si, pointer)
                    }
                    // Always re-snap the handle back to the (now-updated)
                    // segment midpoint so the next drag starts consistently.
                    const el = useElementsStore.getState().elements[wall.id]
                    if (el && isWallElement(el)) {
                      const fresh = wallSegments(el.points, el.bulges)[si]
                      if (fresh) {
                        const m = segmentMidpoint(fresh)
                        node.position({ x: m.x, y: m.y })
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
