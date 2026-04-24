import { useRef } from 'react'
import { Layer, Rect, Circle } from 'react-konva'
import type Konva from 'konva'
import { useUIStore } from '../../../stores/uiStore'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useNeighborhoodStore } from '../../../stores/neighborhoodStore'

/**
 * Renders:
 *
 *   1. A dashed preview rectangle while the user is drag-creating a new
 *      neighborhood (`preview` prop, driven by CanvasStage).
 *   2. Invisible hit-test rectangles over each existing neighborhood when
 *      the neighborhood tool is active — clicking one selects it so the
 *      PropertiesPanel rename/color controls light up.
 *   3. Four corner drag-handles on the currently-selected neighborhood
 *      for resize. Handles are in their own Layer for separation from
 *      the translucent-tint layer that `NeighborhoodLayer` renders.
 *
 * Rationale for separating from `NeighborhoodLayer`: the tint layer uses
 * `listening={false}` so it doesn't participate in hit-testing at all.
 * Interaction lives here so we can toggle participation without having
 * to unmount the visual layer.
 */

interface Preview {
  startX: number
  startY: number
  endX: number
  endY: number
}

interface NeighborhoodEditOverlayProps {
  preview: Preview | null
}

const HANDLE_RADIUS = 5

export function NeighborhoodEditOverlay({ preview }: NeighborhoodEditOverlayProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const activeTool = useCanvasStore((s) => s.activeTool)
  const activeFloorId = useFloorStore((s) => s.activeFloorId)
  const neighborhoods = useNeighborhoodStore((s) => s.neighborhoods)
  const updateNeighborhood = useNeighborhoodStore((s) => s.updateNeighborhood)

  // Which neighborhood is currently selected (if any). A single-element
  // selection containing a neighborhood id is the gate for the handle render.
  const selectedNeighborhood =
    selectedIds.length === 1 ? neighborhoods[selectedIds[0]] : undefined

  // Floor-filtered list of neighborhoods for hit-testing when the
  // neighborhood tool is the active tool.
  const floorNeighborhoods = Object.values(neighborhoods).filter(
    (n) => n.floorId === activeFloorId,
  )

  // Per-handle drag state. We hold the original size and anchor the
  // opposing corner so a drag that crosses the anchor flips width/height
  // cleanly without distorting.
  const dragRef = useRef<{
    id: string
    anchorX: number
    anchorY: number
  } | null>(null)

  const renderPreview = () => {
    if (!preview) return null
    const x = Math.min(preview.startX, preview.endX)
    const y = Math.min(preview.startY, preview.endY)
    const w = Math.abs(preview.endX - preview.startX)
    const h = Math.abs(preview.endY - preview.startY)
    return (
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        stroke="#3B82F6"
        strokeWidth={1}
        dash={[6, 4]}
        fill="rgba(59, 130, 246, 0.08)"
        listening={false}
      />
    )
  }

  // When the neighborhood tool is active, lay an invisible hit rect over
  // each neighborhood so the user can click to select. Without this the
  // main layer (listening=false) wouldn't produce any hit, and CanvasStage
  // would route the click into a fresh drag-create.
  const renderPickers = () => {
    if (activeTool !== 'neighborhood') return null
    return floorNeighborhoods.map((n) => {
      const left = n.x - n.width / 2
      const top = n.y - n.height / 2
      return (
        <Rect
          key={`pick-${n.id}`}
          x={left}
          y={top}
          width={n.width}
          height={n.height}
          // Hair-thin invisible fill — Konva needs a fill to participate
          // in hit testing. 0.001 alpha is effectively invisible but
          // still counts as opaque for the hit-graph.
          fill="rgba(0,0,0,0.001)"
          onMouseDown={(e) => {
            // Swallow so CanvasStage doesn't also treat this as a
            // drag-create anchor.
            e.cancelBubble = true
            useUIStore.getState().setSelectedIds([n.id])
          }}
        />
      )
    })
  }

  // Selection outline + corner handles. Dragging a corner resizes the
  // neighborhood with the OPPOSITE corner anchored, mirroring the
  // behaviour of every drawing app.
  const renderHandles = () => {
    if (!selectedNeighborhood) return null
    const n = selectedNeighborhood
    const left = n.x - n.width / 2
    const top = n.y - n.height / 2
    const right = n.x + n.width / 2
    const bottom = n.y + n.height / 2

    const corners: { key: string; x: number; y: number; anchorX: number; anchorY: number }[] = [
      { key: 'tl', x: left, y: top, anchorX: right, anchorY: bottom },
      { key: 'tr', x: right, y: top, anchorX: left, anchorY: bottom },
      { key: 'bl', x: left, y: bottom, anchorX: right, anchorY: top },
      { key: 'br', x: right, y: bottom, anchorX: left, anchorY: top },
    ]

    const onHandleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
      const session = dragRef.current
      if (!session) return
      const newX = e.target.x()
      const newY = e.target.y()
      const { anchorX, anchorY } = session
      const nextLeft = Math.min(anchorX, newX)
      const nextTop = Math.min(anchorY, newY)
      const nextWidth = Math.max(1, Math.abs(newX - anchorX))
      const nextHeight = Math.max(1, Math.abs(newY - anchorY))
      updateNeighborhood(session.id, {
        x: nextLeft + nextWidth / 2,
        y: nextTop + nextHeight / 2,
        width: nextWidth,
        height: nextHeight,
      })
    }

    return (
      <>
        <Rect
          x={left}
          y={top}
          width={n.width}
          height={n.height}
          stroke="#3B82F6"
          strokeWidth={1.5}
          dash={[4, 3]}
          listening={false}
        />
        {corners.map((c) => (
          <Circle
            key={c.key}
            x={c.x}
            y={c.y}
            radius={HANDLE_RADIUS}
            fill="#ffffff"
            stroke="#3B82F6"
            strokeWidth={1.5}
            draggable
            onDragStart={() => {
              dragRef.current = {
                id: n.id,
                anchorX: c.anchorX,
                anchorY: c.anchorY,
              }
            }}
            onDragMove={onHandleDragMove}
            onDragEnd={() => {
              dragRef.current = null
            }}
          />
        ))}
      </>
    )
  }

  return (
    <Layer>
      {renderPickers()}
      {renderPreview()}
      {renderHandles()}
    </Layer>
  )
}
