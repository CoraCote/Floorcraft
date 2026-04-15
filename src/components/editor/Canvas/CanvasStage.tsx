import { Stage } from 'react-konva'
import { useRef, useCallback, useState, useEffect } from 'react'
import type Konva from 'konva'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useUIStore } from '../../../stores/uiStore'
import { GridLayer } from './GridLayer'
import { ElementRenderer } from './ElementRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import { AlignmentGuides } from './AlignmentGuides'
import { WallDrawingOverlay } from './WallDrawingOverlay'
import { useWallDrawing } from '../../../hooks/useWallDrawing'
import { ZOOM_MIN, ZOOM_MAX } from '../../../lib/constants'

export function CanvasStage() {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const { stageX, stageY, stageScale, setStagePosition, setStageScale, activeTool } = useCanvasStore()
  const { clearSelection, setContextMenu } = useUIStore()
  const { wallDrawingState, handleCanvasClick, handleCanvasMouseMove, handleCanvasDoubleClick } = useWallDrawing()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return

      const oldScale = stageScale
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const scaleBy = 1.08
      const newScale = e.evt.deltaY < 0
        ? Math.min(ZOOM_MAX, oldScale * scaleBy)
        : Math.max(ZOOM_MIN, oldScale / scaleBy)

      const mousePointTo = {
        x: (pointer.x - stageX) / oldScale,
        y: (pointer.y - stageY) / oldScale,
      }

      setStageScale(newScale)
      setStagePosition(
        pointer.x - mousePointTo.x * newScale,
        pointer.y - mousePointTo.y * newScale
      )
    },
    [stageScale, stageX, stageY, setStageScale, setStagePosition]
  )

  const isPanning = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 2) {
        e.evt.preventDefault()
        setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, elementId: null })
        return
      }

      if (e.evt.button === 1 || activeTool === 'pan') {
        isPanning.current = true
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
        return
      }

      if (activeTool === 'wall' && e.evt.button === 0) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        handleCanvasClick(canvasX, canvasY)
        return
      }

      if (e.target === e.target.getStage()) {
        clearSelection()
        setContextMenu(null)
      }
    },
    [activeTool, clearSelection, setContextMenu, stageX, stageY, stageScale, handleCanvasClick]
  )

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isPanning.current) {
        const dx = e.evt.clientX - lastPointer.current.x
        const dy = e.evt.clientY - lastPointer.current.y
        lastPointer.current = { x: e.evt.clientX, y: e.evt.clientY }
        setStagePosition(stageX + dx, stageY + dy)
      }

      if (activeTool === 'wall') {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const canvasX = (pointer.x - stageX) / stageScale
        const canvasY = (pointer.y - stageY) / stageScale
        handleCanvasMouseMove(canvasX, canvasY)
      }
    },
    [stageX, stageY, stageScale, activeTool, setStagePosition, handleCanvasMouseMove]
  )

  const handleMouseUp = useCallback(() => {
    isPanning.current = false
  }, [])

  const cursor = activeTool === 'pan' ? 'grab' : activeTool === 'wall' ? 'crosshair' : 'default'

  return (
    <div ref={containerRef} className="w-full h-full" style={{ cursor }}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={stageX}
        y={stageY}
        scaleX={stageScale}
        scaleY={stageScale}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleCanvasDoubleClick}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <GridLayer width={size.width} height={size.height} />
        <ElementRenderer />
        <SelectionOverlay />
        <AlignmentGuides guides={[]} />
        <WallDrawingOverlay {...wallDrawingState} />
      </Stage>
    </div>
  )
}
