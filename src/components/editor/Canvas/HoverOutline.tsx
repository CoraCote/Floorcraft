import { Layer, Transformer } from 'react-konva'
import { useRef, useEffect } from 'react'
import type Konva from 'konva'
import { useUIStore } from '../../../stores/uiStore'
import { useCanvasStore } from '../../../stores/canvasStore'

/**
 * Faint dashed outline that tracks the currently hovered element when
 * the select tool is active. On crowded floors users otherwise can't
 * tell what their next click will select — especially with overlapping
 * decor + desks, or small elements under a wall. This closes that loop
 * so "hover → preview → click → select" feels continuous instead of
 * the previous "click blindly and hope."
 *
 * We piggy-back on Konva's `Transformer` rather than drawing our own
 * rotated rect because the transformer already knows how to wrap any
 * node's client rect (group, primitive, wall polyline) and follows
 * rotation/scale automatically. Disabling resize + rotate + anchors
 * turns it into a pure border-with-optional-dash renderer.
 *
 * The hover outline is suppressed when the hovered element is already
 * selected — the saturated selection border already communicates that
 * state and drawing a faint dashed one on top just looks like a bug.
 */
export function HoverOutline() {
  const hoveredId = useUIStore((s) => s.hoveredId)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const activeTool = useCanvasStore((s) => s.activeTool)
  const trRef = useRef<Konva.Transformer>(null)

  // Hide the outline on non-select tools (drawing tools don't imply
  // "which element am I about to click"), when nothing is hovered, or
  // when the hovered element is already in the selection set.
  const shouldRender =
    activeTool === 'select' &&
    hoveredId !== null &&
    !selectedIds.includes(hoveredId)

  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    if (!shouldRender || hoveredId === null) {
      tr.nodes([])
      tr.getLayer()?.batchDraw()
      return
    }
    const stage = tr.getStage()
    if (!stage) return
    const node = stage.findOne(`#element-${hoveredId}`)
    if (node) {
      tr.nodes([node])
    } else {
      tr.nodes([])
    }
    tr.getLayer()?.batchDraw()
  }, [hoveredId, shouldRender])

  if (!shouldRender) return null

  return (
    <Layer listening={false}>
      <Transformer
        ref={trRef}
        resizeEnabled={false}
        rotateEnabled={false}
        // `borderEnabled` defaults true; we just want the rectangle.
        borderStroke="#60A5FA"
        borderStrokeWidth={1}
        borderDash={[4, 3]}
        padding={3}
      />
    </Layer>
  )
}
