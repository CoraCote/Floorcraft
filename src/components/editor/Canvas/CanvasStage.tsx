import { Stage } from 'react-konva'
import { useRef, useCallback, useState, useEffect } from 'react'
import type Konva from 'konva'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useUIStore } from '../../../stores/uiStore'
import { useElementsStore } from '../../../stores/elementsStore'
import { useFloorStore } from '../../../stores/floorStore'
import { useShallow } from 'zustand/react/shallow'
import { GridLayer } from './GridLayer'
import { ElementRenderer } from './ElementRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import { AlignmentGuides } from './AlignmentGuides'
import { WallDrawingOverlay } from './WallDrawingOverlay'
import { OrgChartOverlay } from '../../reports/OrgChartOverlay'
import { SeatMapColorMode } from '../../reports/SeatMapColorMode'
import { useWallDrawing } from '../../../hooks/useWallDrawing'
import { ZOOM_MIN, ZOOM_MAX } from '../../../lib/constants'
import { isAssignableElement } from '../../../types/elements'
import { assignEmployee } from '../../../lib/seatAssignment'

export function CanvasStage() {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  const { stageX, stageY, stageScale, setStagePosition, setStageScale, activeTool } = useCanvasStore(useShallow((s) => ({ stageX: s.stageX, stageY: s.stageY, stageScale: s.stageScale, setStagePosition: s.setStagePosition, setStageScale: s.setStageScale, activeTool: s.activeTool })))
  const { clearSelection, setContextMenu } = useUIStore(useShallow((s) => ({ clearSelection: s.clearSelection, setContextMenu: s.setContextMenu })))
  const orgChartOverlayEnabled = useUIStore((s) => s.orgChartOverlayEnabled)
  const seatMapColorMode = useUIStore((s) => s.seatMapColorMode)
  const {
    wallDrawingState,
    handleCanvasMouseDown: onWallMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp: onWallMouseUp,
    handleCanvasDoubleClick,
  } = useWallDrawing()

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
        onWallMouseDown(canvasX, canvasY)
        return
      }

      if (e.target === e.target.getStage()) {
        clearSelection()
        setContextMenu(null)
      }
    },
    [activeTool, clearSelection, setContextMenu, stageX, stageY, stageScale, onWallMouseDown]
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
    if (activeTool === 'wall') {
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return
      const canvasX = (pointer.x - stageX) / stageScale
      const canvasY = (pointer.y - stageY) / stageScale
      onWallMouseUp(canvasX, canvasY)
    }
  }, [activeTool, stageX, stageY, stageScale, onWallMouseUp])

  const cursor = activeTool === 'pan' ? 'grab' : activeTool === 'wall' ? 'crosshair' : 'default'

  // Accept employee drags from PeoplePanel and assign the dropped employee
  // to whatever assignable element is under the cursor.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/employee-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const empId = e.dataTransfer.getData('application/employee-id')
    if (!empId) return
    e.preventDefault()

    const stage = stageRef.current
    if (!stage) return

    // Translate the drop's client coords into canvas (stage-local) coords.
    // Match the convention used elsewhere in this file (wall-drawing click/move,
    // wheel zoom): subtract the stage origin and divide by scale.
    stage.setPointersPositions(e.nativeEvent)
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const pos = {
      x: (pointer.x - stageX) / stageScale,
      y: (pointer.y - stageY) / stageScale,
    }

    // Hit-test assignable elements. (el.x, el.y) is CENTER; rotation is
    // ignored for this drop target (acceptable simplification).
    // Skip locked and hidden elements — they can't accept a drop.
    const elements = useElementsStore.getState().elements
    let hitId: string | null = null
    let hitZ = -Infinity
    for (const el of Object.values(elements)) {
      if (!isAssignableElement(el)) continue
      if (el.locked) continue
      if (el.visible === false) continue
      const halfW = el.width / 2
      const halfH = el.height / 2
      if (
        pos.x >= el.x - halfW &&
        pos.x <= el.x + halfW &&
        pos.y >= el.y - halfH &&
        pos.y <= el.y + halfH
      ) {
        // Prefer topmost element on overlap. Use strict `>` so ties resolve
        // to the first iterated match (stable order).
        if (el.zIndex > hitZ) {
          hitZ = el.zIndex
          hitId = el.id
        }
      }
    }

    if (hitId) {
      assignEmployee(empId, hitId, useFloorStore.getState().activeFloorId)
    }
  }, [stageX, stageY, stageScale])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ cursor }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
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
        {orgChartOverlayEnabled && <OrgChartOverlay />}
        {seatMapColorMode && <SeatMapColorMode />}
        <AlignmentGuides guides={[]} />
        <WallDrawingOverlay {...wallDrawingState} />
      </Stage>
    </div>
  )
}
