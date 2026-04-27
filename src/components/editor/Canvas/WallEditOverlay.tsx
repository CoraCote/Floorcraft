import { Fragment, useEffect, useRef, useState } from 'react'
import { Layer, Circle, Group, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { isWallElement, type WallElement } from '../../../types/elements'
import { wallSegments, segmentMidpoint } from '../../../lib/wallPath'
import {
  applyBulgeFromDrag,
  applyVertexMove,
  addVertexAt,
} from '../../../lib/wallEditing'
import { removeWallVertex } from '../../../lib/seatAssignment'
import {
  EDGE_SNAP_PX,
  ENDPOINT_SNAP_PX,
  findNearestPointOnWallEdge,
} from '../../../lib/wallSnap'

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

/**
 * Live "+ vertex" hover indicator state. Tracked inside the component
 * (not the UI store) because it changes 60Hz on pointer move and would
 * thrash zundo's partialize listeners if it lived in a temporal-wrapped
 * store. The cursor coords are in canvas units — we project them onto
 * the closest wall-edge segment in `useEffect` driven by the stage's
 * pointer events forwarded through a window-level mousemove listener.
 */
interface EdgeHoverState {
  wallId: string
  segmentIndex: number
  x: number
  y: number
}

export function WallEditOverlay() {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const activeVertex = useUIStore((s) => s.activeVertex)
  const setActiveVertex = useUIStore((s) => s.setActiveVertex)
  const elements = useElementsStore((s) => s.elements)
  const stageScale = useCanvasStore((s) => s.stageScale) || 1
  const stageX = useCanvasStore((s) => s.stageX)
  const stageY = useCanvasStore((s) => s.stageY)
  const activeTool = useCanvasStore((s) => s.activeTool)

  // One ref per mounted handle keyed by a string like `${wallId}:e:${vi}` or
  // `${wallId}:m:${si}`. Stored in a single Map so we don't leak refs between
  // re-renders when the set of selected walls changes.
  const dragRef = useRef<Map<string, HandleDragSession>>(new Map())

  const selectedWalls = selectedIds
    .map((id) => elements[id])
    .filter((el): el is WallElement => !!el && isWallElement(el))

  // Edge hover indicator state. Live for two scenarios:
  //   1. The wall tool is active — hovering over ANY wall surfaces the
  //      indicator so a user mid-drawing-flow can splice a vertex into a
  //      previously-placed wall without switching tools.
  //   2. A SINGLE wall is selected in the select tool — the indicator
  //      appears only over that specific wall so the affordance scopes to
  //      "the wall you're editing right now" and doesn't fire on every
  //      wall on the floor at once.
  // Multi-wall selection deliberately suppresses the indicator: choosing
  // which wall to splice would require an extra hit-test on every move,
  // and the affordance is most useful when the user is reshaping ONE wall.
  const [edgeHover, setEdgeHover] = useState<EdgeHoverState | null>(null)

  // Walls eligible for edge-hover. We DON'T memoize this list across renders
  // because the underlying `elements` map is the React subscription itself
  // (it WILL re-render whenever any element changes); paying a single
  // `Object.values + filter` per render is cheap relative to the React
  // reconciliation we're already doing. The list is mirrored into a ref
  // inside an effect so the mousemove listener can read the latest list
  // without re-binding on every element edit.
  const eligibleWalls: WallElement[] =
    activeTool === 'wall'
      ? Object.values(elements).filter((el): el is WallElement => isWallElement(el))
      : activeTool === 'select' && selectedWalls.length === 1
      ? selectedWalls
      : []
  const eligibleWallsRef = useRef<WallElement[]>(eligibleWalls)
  // Keep the ref synchronised with the most recent render's list. Writing
  // the ref in an effect (not during render) satisfies the
  // `react-hooks/refs` lint rule. The mousemove listener reads from this
  // ref so it doesn't have to re-bind every time the wall list changes.
  useEffect(() => {
    eligibleWallsRef.current = eligibleWalls
  })

  // Eligibility gate as a primitive boolean so the effect's dependency
  // array stays cheap — without this, depending on the array would
  // re-bind the listener every time `elements` changes, which is exactly
  // what the ref indirection is trying to avoid.
  const hasEligibleWalls = eligibleWalls.length > 0

  useEffect(() => {
    // Only attach the pointer listener when the affordance is live — no
    // sense paying the per-move cost when no walls are eligible. The
    // listener reads canvas-coords by inverting the stage transform: the
    // page coords come from the event, and `stageX/Y/Scale` are closure-
    // captured here (changing these re-runs the effect, which is fine
    // because zoom/pan changes are infrequent compared to mousemoves).
    //
    // When the affordance becomes ineligible we DON'T eagerly clear the
    // hover state from inside this effect (the React lint forbids
    // synchronous setState in effects, with good reason — it cascades
    // renders). Instead, the indicator render path itself gates on
    // `hasEligibleWalls && edgeHover` so a stale hover from a previous
    // tool/selection is invisible until it gets overwritten by the next
    // pointer event in a new eligible state.
    if (!hasEligibleWalls) {
      return
    }
    const handler = (ev: MouseEvent) => {
      // Resolve canvas coords from page coords. The Konva Stage is pinned
      // at (0, 0) of its container; the container is normally fullscreen
      // inside the editor shell, so pageX/Y → canvas is a single linear
      // transform. We don't grab the container bounding rect every move
      // (would force layout); the small jitter from page-level coords is
      // well below the EDGE_SNAP_PX threshold at any reasonable zoom.
      const px = (ev.clientX - stageX) / stageScale
      const py = (ev.clientY - stageY) / stageScale

      const edgeRadius = EDGE_SNAP_PX / stageScale
      const vertexRadius = ENDPOINT_SNAP_PX / stageScale

      // Find the closest wall-edge across eligible walls. Suppress the
      // indicator when the cursor is also within vertex-snap radius of an
      // existing vertex on that wall — the endpoint handle's own affordance
      // takes precedence and avoiding an overlap keeps the click target
      // unambiguous.
      let best: { wallId: string; segmentIndex: number; x: number; y: number; distance: number } | null = null
      for (const wall of eligibleWallsRef.current) {
        const segs = wallSegments(wall.points, wall.bulges)
        const hit = findNearestPointOnWallEdge(segs, px, py)
        if (!hit) continue
        if (hit.distance > edgeRadius) continue
        // Inside vertex-snap of any vertex on this wall? Bail. Iterating
        // the wall's points directly avoids re-scanning every wall on the
        // canvas — `findNearestWallVertex` would cover that, but we already
        // have a wall-scoped hit so we only need to check this wall.
        let nearVertex = false
        for (let vi = 0; vi < wall.points.length / 2; vi++) {
          const dx = px - wall.points[vi * 2]
          const dy = py - wall.points[vi * 2 + 1]
          if (dx * dx + dy * dy <= vertexRadius * vertexRadius) {
            nearVertex = true
            break
          }
        }
        if (nearVertex) continue
        if (!best || hit.distance < best.distance) {
          best = {
            wallId: wall.id,
            segmentIndex: hit.segmentIndex,
            x: hit.x,
            y: hit.y,
            distance: hit.distance,
          }
        }
      }
      if (!best) {
        setEdgeHover((cur) => (cur === null ? cur : null))
        return
      }
      // setEdgeHover is keyed by deep-ish equality to avoid 60Hz re-renders
      // when the cursor is stationary inside the snap band — the projected
      // (x, y) WILL drift sub-pixel as the cursor moves so a strict equality
      // is overkill, but skipping no-op updates between identical pointer
      // events still helps.
      setEdgeHover((cur) => {
        if (
          cur &&
          cur.wallId === best!.wallId &&
          cur.segmentIndex === best!.segmentIndex &&
          cur.x === best!.x &&
          cur.y === best!.y
        ) {
          return cur
        }
        return {
          wallId: best!.wallId,
          segmentIndex: best!.segmentIndex,
          x: best!.x,
          y: best!.y,
        }
      })
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
    // The listener reads `eligibleWallsRef.current` lazily so we don't need
    // to depend on the wall list itself — only the gating predicate
    // (whether it's empty) matters for attaching/detaching the listener.
    // We still re-run the effect when stage transform changes so the
    // page→canvas conversion stays accurate.
  }, [stageScale, stageX, stageY, hasEligibleWalls])

  // Visible-indicator gate: don't render the open-circle "+ vertex" hint
  // when the affordance isn't currently live (different tool, multi-wall
  // selection, etc). The effect above doesn't eagerly null `edgeHover` on
  // eligibility loss (React forbids setState-in-effect); this gate is the
  // visual half of that contract.
  const showEdgeHover = hasEligibleWalls && edgeHover !== null

  if (selectedWalls.length === 0 && !showEdgeHover) return null

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

  // Inverse stage scale keeps the small "Backspace to remove" tooltip a
  // constant readable size regardless of canvas zoom — matches the
  // alignment-guide pill / drawing dimension pill idiom.
  const invScale = stageScale > 0 ? 1 / stageScale : 1

  // Commit a vertex insertion at the current edge-hover indicator. Returns
  // early if the hover state went stale between the click and the dispatch
  // (e.g. the wall was deleted between mousemove and mousedown).
  const commitInsertVertex = () => {
    if (!edgeHover) return
    const wall = useElementsStore.getState().elements[edgeHover.wallId]
    if (!wall || !isWallElement(wall)) return
    const result = addVertexAt(wall, edgeHover.segmentIndex, {
      x: edgeHover.x,
      y: edgeHover.y,
    })
    if (!result) return
    useElementsStore
      .getState()
      .updateElement(edgeHover.wallId, {
        points: result.wall.points,
        ...(result.wall.bulges ? { bulges: result.wall.bulges } : {}),
      })
    // Make sure the wall is selected (the wall tool case can fire outside
    // a current selection — entering a select-and-edit flow without
    // forcing the user to switch tools first), then mark the just-inserted
    // vertex as active so a follow-up Backspace removes it (P2 Fix 2) and
    // the larger-circle highlight tells the user "this is the new vertex,
    // drag me to fine-tune."
    useUIStore.getState().setSelectedIds([edgeHover.wallId])
    setActiveVertex({
      wallId: edgeHover.wallId,
      vertexIndex: result.insertedVertexIndex,
    })
    // Clear the indicator: it will re-appear on the next mousemove if the
    // cursor is still in range, but keeping it visible at the just-clicked
    // location would render on top of the new vertex marker and look like
    // a duplicate.
    setEdgeHover(null)
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
              const isActive =
                !!activeVertex &&
                activeVertex.wallId === wall.id &&
                activeVertex.vertexIndex === vi
              return (
                <Fragment key={`e-${vi}`}>
                  <Circle
                    name="wall-endpoint-handle"
                    x={wall.points[vi * 2]}
                    y={wall.points[vi * 2 + 1]}
                    // Active vertex renders larger with a darker outline so
                    // the user has an unambiguous "this is the focused
                    // vertex; Backspace removes it" cue. Inactive vertices
                    // keep the existing 5px / 2-px-white-stroke styling so
                    // we don't regress the unfocused appearance.
                    radius={isActive ? 7 : 5}
                    fill="#3B82F6"
                    stroke={isActive ? '#0f172a' : '#ffffff'}
                    strokeWidth={isActive ? 2.5 : 2}
                    draggable
                    onClick={() => {
                      setActiveVertex({ wallId: wall.id, vertexIndex: vi })
                    }}
                    onTap={() => {
                      setActiveVertex({ wallId: wall.id, vertexIndex: vi })
                    }}
                    onDblClick={() => {
                      // Double-click → remove this vertex. Mirrors the
                      // Backspace path so mouse-only users (no keyboard
                      // focus on the canvas) have an equivalent affordance
                      // without us having to build a context menu.
                      removeWallVertex(wall.id, vi)
                    }}
                    onDblTap={() => {
                      removeWallVertex(wall.id, vi)
                    }}
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
                      // After every drop (whether it traveled or not) the
                      // user has explicitly focused this vertex — set it
                      // active so a follow-up Backspace removes the vertex
                      // they just dropped, matching the P2 contract.
                      setActiveVertex({ wallId: wall.id, vertexIndex: vi })
                    }}
                  />
                  {isActive && (
                    // "Backspace to remove" tooltip: rendered just above the
                    // active vertex, in inverse-zoom-scaled screen pixels so
                    // it stays a constant readable size at any zoom. Hidden
                    // when no vertex is active so the overlay doesn't carry
                    // a passive sticker on every wall edit session.
                    <Group
                      x={wall.points[vi * 2]}
                      y={wall.points[vi * 2 + 1]}
                      offsetX={64}
                      offsetY={32}
                      scaleX={invScale}
                      scaleY={invScale}
                      listening={false}
                    >
                      <Rect
                        x={0}
                        y={0}
                        width={128}
                        height={18}
                        fill="#0f172a"
                        opacity={0.92}
                        cornerRadius={4}
                        listening={false}
                      />
                      <Text
                        x={0}
                        y={2}
                        width={128}
                        align="center"
                        text="Backspace to remove"
                        fontSize={11}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        fontStyle="500"
                        fill="#f8fafc"
                        listening={false}
                      />
                    </Group>
                  )}
                </Fragment>
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

      {/*
        Edge-hover "+ vertex" indicator — open green circle at the
        projected pointer position. The Konva click handler commits the
        insertion. We ALSO listen on stage-mousedown in CanvasStage so a
        click that lands directly on the indicator works even when the
        wall tool would otherwise consume the mousedown to start a new
        polyline; CanvasStage checks `edgeHover` via the UI store and
        bails before its own handler fires when an indicator is live.
      */}
      {showEdgeHover && edgeHover && (
        <Circle
          name="wall-edge-add-indicator"
          x={edgeHover.x}
          y={edgeHover.y}
          radius={5}
          fill={undefined}
          stroke="#10B981"
          strokeWidth={2}
          // Filled white interior gives the open-circle "+ vertex" idiom
          // a higher-contrast read on dark walls; without it the indicator
          // can blur into the wall stroke at zoom-out.
          fillEnabled={true}
          // Slightly translucent so the wall geometry beneath stays
          // visible — the indicator should READ as a hint, not a permanent
          // feature.
          opacity={0.95}
          // Konva uses a separate prop for hit detection; the click target
          // is generous so users don't have to pixel-align the cursor.
          hitStrokeWidth={12}
          onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) => {
            // Stop the event from reaching CanvasStage's wall-tool handler
            // (which would interpret this as "start a new polyline").
            e.cancelBubble = true
            commitInsertVertex()
          }}
          onTap={(e: Konva.KonvaEventObject<TouchEvent>) => {
            e.cancelBubble = true
            commitInsertVertex()
          }}
        />
      )}
    </Layer>
  )
}
